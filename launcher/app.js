(function () {
  "use strict";

  var FORMAT_LABEL = { single: "単一HTML", folder: "フォルダ", zip: "ZIP" };
  var THEME_KEY = "launcher:theme";

  var games = [];
  var selectedId = null;
  var $ = function (id) { return document.getElementById(id); };
  var viewList = $("view-list"), viewPlay = $("view-play"), stage = $("stage"), frame = $("frame");

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  // ---------- テーマ ----------
  function currentTheme() { return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light"; }
  function applyTheme(t) {
    document.documentElement.setAttribute("data-theme", t);
    try { localStorage.setItem(THEME_KEY, t); } catch (e) {}
    var label = t === "dark" ? "☀ ライト" : "☾ ダーク";
    Array.prototype.forEach.call(document.querySelectorAll(".theme-toggle"), function (b) { b.textContent = label; });
  }
  Array.prototype.forEach.call(document.querySelectorAll(".theme-toggle"), function (b) {
    b.addEventListener("click", function () { applyTheme(currentTheme() === "dark" ? "light" : "dark"); });
  });
  applyTheme(currentTheme());

  // ---------- 一覧 ----------
  function findGame(id) { return games.filter(function (g) { return g.id === id; })[0] || null; }

  function placeholder(title) {
    var p = el("div", "placeholder");
    p.appendChild(el("div", "ph-char", (title || "?").charAt(0)));
    p.appendChild(el("div", "ph-text", "NO IMAGE"));
    return p;
  }

  function renderList() {
    $("count").textContent = games.length + " ゲーム";
    var ul = $("game-list");
    ul.textContent = "";
    games.forEach(function (g) {
      var li = el("li", "game-item" + (g.id === selectedId ? " selected" : ""));
      var main = el("div", "item-main");
      main.appendChild(el("div", "item-title", g.title));
      main.appendChild(el("span", "badge", FORMAT_LABEL[g.format] || g.format));
      var play = el("button", "btn accent item-play", "▶ プレイ");
      play.type = "button";
      play.addEventListener("click", function (ev) { ev.stopPropagation(); play_(g.id); });
      li.appendChild(main);
      li.appendChild(play);
      li.addEventListener("click", function () { select(g.id); });
      ul.appendChild(li);
    });
    renderDetail();
  }

  function select(id) {
    selectedId = id;
    Array.prototype.forEach.call($("game-list").children, function (li, i) {
      li.classList.toggle("selected", games[i].id === id);
    });
    renderDetail();
  }

  function renderDetail() {
    var d = $("detail");
    d.textContent = "";
    var g = findGame(selectedId);
    if (!g) {
      d.appendChild(el("p", "empty", games.length ? "左の一覧からゲームを選んでください" : "ゲームがありません。games/ にゲームを追加してください。"));
      return;
    }
    var thumb = el("div", "thumb");
    if (g.thumbnail) {
      var img = el("img");
      img.alt = "";
      img.addEventListener("error", function () { thumb.textContent = ""; thumb.appendChild(placeholder(g.title)); });
      img.src = g.thumbnail;
      thumb.appendChild(img);
    } else {
      thumb.appendChild(placeholder(g.title));
    }
    d.appendChild(thumb);
    d.appendChild(el("h2", "detail-title", g.title));
    if (g.description) d.appendChild(el("p", "detail-desc", g.description));
    var big = el("button", "btn accent play-big", "▶ プレイ");
    big.type = "button";
    big.addEventListener("click", function () { play_(g.id); });
    d.appendChild(big);
  }

  // ---------- 画面切り替え ----------
  function play_(id) { location.hash = "#/play/" + encodeURIComponent(id); }
  function toList() { location.hash = "#/"; }

  function route() {
    var m = /^#\/play\/(.+)$/.exec(location.hash);
    var g = m ? findGame(decodeURIComponent(m[1])) : null;
    if (g) showPlay(g); else showList();
  }

  function showList() {
    exitFullscreen();
    frame.src = "about:blank";
    viewPlay.hidden = true;
    viewList.hidden = false;
    document.title = "HTMLゲームランチャー";
  }

  var currentGame = null;
  function showPlay(g) {
    currentGame = g;
    selectedId = g.id;
    viewList.hidden = true;
    viewPlay.hidden = false;
    $("play-title").textContent = g.title;
    document.title = g.title + " - HTMLゲームランチャー";
    frame.src = g.path;
    frame.focus();
  }

  $("back").addEventListener("click", toList);
  $("fs-back").addEventListener("click", toList);
  $("restart").addEventListener("click", function () {
    if (!currentGame) return;
    try { frame.contentWindow.location.replace(currentGame.path); } catch (e) { frame.src = currentGame.path; }
    frame.focus();
  });
  frame.addEventListener("load", function () { if (!viewPlay.hidden) frame.focus(); });

  // ---------- 全画面 ----------
  function fsElement() { return document.fullscreenElement || document.webkitFullscreenElement || null; }
  function exitFullscreen() {
    if (!fsElement()) return;
    var f = document.exitFullscreen || document.webkitExitFullscreen;
    if (f) f.call(document);
  }
  $("fullscreen").addEventListener("click", function () {
    if (fsElement()) { exitFullscreen(); return; }
    var f = stage.requestFullscreen || stage.webkitRequestFullscreen;
    if (f) f.call(stage);
  });
  function onFsChange() {
    var on = fsElement() === stage;
    stage.classList.toggle("is-fs", on);
    stage.classList.remove("bar-visible");
    $("fullscreen").textContent = on ? "全画面を解除" : "全画面";
    if (viewPlay.hidden === false) frame.focus();
  }
  document.addEventListener("fullscreenchange", onFsChange);
  document.addEventListener("webkitfullscreenchange", onFsChange);
  $("hotzone").addEventListener("mouseenter", function () { stage.classList.add("bar-visible"); });
  $("playbar").addEventListener("mouseleave", function () { stage.classList.remove("bar-visible"); });
  stage.addEventListener("mousemove", function (ev) {
    if (stage.classList.contains("bar-visible") && ev.clientY > $("playbar").offsetHeight + 24) stage.classList.remove("bar-visible");
  });

  // ---------- 起動 ----------
  window.addEventListener("hashchange", route);
  fetch("games.json", { cache: "no-store" })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (j) {
      games = Array.isArray(j.games) ? j.games : [];
      if (games.length) selectedId = games[0].id;
      renderList();
      route();
    })
    .catch(function () {
      $("detail").textContent = "";
      $("detail").appendChild(el("p", "empty", "ゲーム一覧を読み込めませんでした。HTTPサーバー経由で開いてください（file:// では動きません）。"));
    });
})();
