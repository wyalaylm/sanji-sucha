const state = {
  questions: [],
  query: "",
  module: "",
  favoritesOnly: false,
  favorites: new Set(JSON.parse(localStorage.getItem("sj-favorites") || "[]")),
};

const els = {
  input: document.querySelector("#searchInput"),
  clear: document.querySelector("#clearButton"),
  module: document.querySelector("#moduleFilter"),
  favorites: document.querySelector("#favoritesFilter"),
  results: document.querySelector("#results"),
  count: document.querySelector("#resultCount"),
  stat: document.querySelector("#libraryStat"),
  template: document.querySelector("#questionTemplate"),
  install: document.querySelector("#installButton"),
};

const answerLetters = numbers => numbers.map(number => String.fromCharCode(64 + number));
const normalize = value => value.toLowerCase().replace(/[\s，。、“”‘’；：？！,.!?;:'"（）()]/g, "");

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[char]);
}

function highlighted(text, query) {
  if (!query.trim()) return escapeHtml(text);
  const safe = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return escapeHtml(text).replace(new RegExp(`(${safe})`, "ig"), "<mark>$1</mark>");
}

function rank(question, query) {
  const text = normalize(question.question);
  const needle = normalize(query);
  if (!needle) return 0;
  if (text.startsWith(needle)) return 0;
  const position = text.indexOf(needle);
  return position === -1 ? Infinity : position + 10;
}

function matchedQuestions() {
  const query = state.query.trim();
  return state.questions
    .filter(question => !state.module || question.module === state.module)
    .filter(question => !state.favoritesOnly || state.favorites.has(question.id))
    .map(question => ({ question, score: rank(question, query) }))
    .filter(item => query ? Number.isFinite(item.score) : state.favoritesOnly)
    .sort((a, b) => a.score - b.score || a.question.number - b.question.number)
    .slice(0, 50)
    .map(item => item.question);
}

function render() {
  const matches = matchedQuestions();
  els.results.replaceChildren();
  els.clear.hidden = !state.query;

  if (!state.query.trim() && !state.favoritesOnly) {
    els.count.textContent = "输入关键词开始搜索";
    els.results.innerHTML = `
      <div class="empty-state">
        <div class="index-card" aria-hidden="true"><span>A</span><span>B</span><span>C</span><span>D</span></div>
        <h3>从题干开头输入</h3>
        <p>例如输入“少尿是指”，优先显示题干开头完全匹配的结果。</p>
      </div>`;
    return;
  }

  els.count.textContent = matches.length
    ? `找到 ${matches.length}${matches.length === 50 ? "+" : ""} 道相关题目`
    : "没有找到相关题目";

  if (!matches.length) {
    els.results.innerHTML = `
      <div class="empty-state">
        <div class="index-card" aria-hidden="true"><span>?</span></div>
        <h3>换几个关键词试试</h3>
        <p>可以减少输入字数，或将题库范围切换为“全部模块”。</p>
      </div>`;
    return;
  }

  const fragment = document.createDocumentFragment();
  matches.forEach((question, index) => {
    const card = els.template.content.firstElementChild.cloneNode(true);
    card.style.animationDelay = `${Math.min(index, 8) * 35}ms`;
    card.querySelector(".module-badge").textContent = `${question.category} · ${question.module} · ${question.number}`;
    card.querySelector(".question-text").innerHTML = highlighted(question.question, state.query.trim());

    const options = card.querySelector(".options");
    question.options.forEach((option, optionIndex) => {
      const item = document.createElement("li");
      item.textContent = option;
      if (question.answer.includes(optionIndex + 1)) item.classList.add("correct");
      options.append(item);
    });

    card.querySelector(".answer-value").textContent = answerLetters(question.answer).join("、");
    const star = card.querySelector(".star-button");
    const syncStar = () => {
      const active = state.favorites.has(question.id);
      star.classList.toggle("active", active);
      star.textContent = active ? "★" : "☆";
      star.setAttribute("aria-label", active ? "取消收藏" : "收藏题目");
    };
    syncStar();
    star.addEventListener("click", () => {
      state.favorites.has(question.id) ? state.favorites.delete(question.id) : state.favorites.add(question.id);
      localStorage.setItem("sj-favorites", JSON.stringify([...state.favorites]));
      if (state.favoritesOnly) render(); else syncStar();
    });
    fragment.append(card);
  });
  els.results.append(fragment);
}

async function initialize() {
  try {
    const response = await fetch("data/questions.json");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    state.questions = data.questions;
    els.stat.textContent = `${data.total.toLocaleString("zh-CN")} 道题 · ${Object.keys(data.modules).length} 个模块 · 可离线`;

    Object.entries(data.modules).forEach(([module, count]) => {
      const option = document.createElement("option");
      option.value = module;
      option.textContent = `${module}（${count}）`;
      els.module.append(option);
    });
  } catch (error) {
    els.stat.textContent = "题库加载失败";
    els.count.textContent = "请通过本地服务器或已部署网址打开";
    console.error(error);
  }
}

let timer;
els.input.addEventListener("input", event => {
  state.query = event.target.value;
  clearTimeout(timer);
  timer = setTimeout(render, 80);
});
els.clear.addEventListener("click", () => {
  state.query = "";
  els.input.value = "";
  els.input.focus();
  render();
});
els.module.addEventListener("change", event => {
  state.module = event.target.value;
  render();
});
els.favorites.addEventListener("click", () => {
  state.favoritesOnly = !state.favoritesOnly;
  els.favorites.setAttribute("aria-pressed", String(state.favoritesOnly));
  els.favorites.innerHTML = `<span>${state.favoritesOnly ? "★" : "☆"}</span> 只看收藏`;
  render();
});

let installPrompt;
window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault();
  installPrompt = event;
  els.install.hidden = false;
});
els.install.addEventListener("click", async () => {
  if (!installPrompt) return;
  installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = null;
  els.install.hidden = true;
});

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("sw.js");
}

initialize();

