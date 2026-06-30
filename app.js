(function () {
  "use strict";

  const SUIT_NAMES = ["万", "筒", "条"];
  const WIND_NAMES = ["东", "南", "西", "北"];
  const DRAGON_NAMES = ["中", "发", "白"];
  const MIN_FAN = 8;
  const MAX_ENUMERATED_WAYS = 220;

  const TILE_DEFS = buildTileDefs();
  const state = {
    concealed: [],
    selectedIds: new Set(),
    melds: [],
    nextId: 1,
    nextMeldId: 1,
    selectedWinTile: "",
    draggedTileId: null,
    lastHandTap: { id: null, time: 0 }
  };

  const els = {};

  function buildTileDefs() {
    const defs = [];
    for (let suit = 0; suit < 3; suit += 1) {
      for (let rank = 1; rank <= 9; rank += 1) {
        defs.push({
          id: defs.length,
          name: `${rank}${SUIT_NAMES[suit]}`,
          label: `${rank}${SUIT_NAMES[suit]}`,
          suit,
          rank,
          className: suit === 0 ? "tile-man" : suit === 1 ? "tile-pin" : "tile-sou"
        });
      }
    }
    for (let i = 0; i < 4; i += 1) {
      defs.push({
        id: defs.length,
        name: `${WIND_NAMES[i]}风`,
        label: WIND_NAMES[i],
        suit: 3,
        rank: i + 1,
        className: "tile-feng"
      });
    }
    for (let i = 0; i < 3; i += 1) {
      defs.push({
        id: defs.length,
        name: DRAGON_NAMES[i],
        label: DRAGON_NAMES[i],
        suit: 4,
        rank: i + 1,
        className: i === 0 ? "tile-zhong" : i === 1 ? "tile-fa" : "tile-bai"
      });
    }
    return defs;
  }

  function init() {
    cacheElements();
    renderPalette();
    bindEvents();
    renderAll();
  }

  function cacheElements() {
    [
      "tilePalette",
      "handTiles",
      "physicalCount",
      "effectiveCount",
      "makeChi",
      "makePeng",
      "makeMingGang",
      "makeAnGang",
      "clearMeld",
      "clearSelection",
      "undoTile",
      "clearAll",
      "roundWind",
      "seatWind",
      "winTileSelect",
      "flowerCount",
      "lastDraw",
      "lastDiscard",
      "kongDraw",
      "robKong",
      "lastTile",
      "result"
    ].forEach((id) => {
      els[id] = document.getElementById(id);
    });
  }

  function bindEvents() {
    els.tilePalette.addEventListener("click", (event) => {
      const button = event.target.closest("[data-tile]");
      if (!button || button.disabled) return;
      addConcealedTile(Number(button.dataset.tile));
    });
    els.tilePalette.addEventListener("dragover", (event) => {
      if (state.draggedTileId === null) return;
      event.preventDefault();
      els.tilePalette.classList.add("drop-target");
    });
    els.tilePalette.addEventListener("dragleave", (event) => {
      if (!els.tilePalette.contains(event.relatedTarget)) {
        els.tilePalette.classList.remove("drop-target");
      }
    });
    els.tilePalette.addEventListener("drop", (event) => {
      event.preventDefault();
      const id = Number(event.dataTransfer.getData("text/plain") || state.draggedTileId);
      els.tilePalette.classList.remove("drop-target");
      if (Number.isFinite(id)) removeTileById(id);
    });

    els.handTiles.addEventListener("click", (event) => {
      const button = event.target.closest("[data-id]");
      if (!button) return;
      const id = Number(button.dataset.id);
      if (handleHandTileDoubleTap(id, event)) return;
      toggleSelected(id);
    });
    els.handTiles.addEventListener("dblclick", (event) => {
      const button = event.target.closest("[data-id]");
      if (!button) return;
      event.preventDefault();
      removeTileById(Number(button.dataset.id));
    });
    els.handTiles.addEventListener("dragstart", (event) => {
      const button = event.target.closest("[data-id]");
      if (!button) return;
      const id = Number(button.dataset.id);
      state.draggedTileId = id;
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", String(id));
      button.classList.add("dragging");
    });
    els.handTiles.addEventListener("dragend", (event) => {
      const button = event.target.closest("[data-id]");
      if (button) button.classList.remove("dragging");
      state.draggedTileId = null;
      els.tilePalette.classList.remove("drop-target");
    });

    els.makeChi.addEventListener("click", () => makeMeld("chi"));
    els.makePeng.addEventListener("click", () => makeMeld("peng"));
    els.makeMingGang.addEventListener("click", () => makeMeld("minggang"));
    els.makeAnGang.addEventListener("click", () => makeMeld("angang"));
    els.clearMeld.addEventListener("click", clearSelectedMelds);
    els.clearSelection.addEventListener("click", () => {
      state.selectedIds.clear();
      renderAll();
    });
    els.undoTile.addEventListener("click", undoLastTile);
    els.clearAll.addEventListener("click", clearAll);
    document.addEventListener("keydown", handleGlobalShortcuts);
    document.addEventListener("dblclick", preventDoubleTapZoom, { passive: false });
    els.winTileSelect.addEventListener("change", () => {
      state.selectedWinTile = els.winTileSelect.value;
      analyzeAndRender();
    });

    document.querySelectorAll("input, select").forEach((control) => {
      if (control.id === "winTileSelect") return;
      control.addEventListener("change", analyzeAndRender);
      control.addEventListener("input", analyzeAndRender);
    });
  }

  function handleHandTileDoubleTap(id, event) {
    const now = Date.now();
    const isDoubleTap = state.lastHandTap.id === id && now - state.lastHandTap.time <= 350;
    state.lastHandTap = { id, time: now };
    if (!isDoubleTap) return false;
    event.preventDefault();
    removeTileById(id);
    state.lastHandTap = { id: null, time: 0 };
    return true;
  }

  function preventDoubleTapZoom(event) {
    event.preventDefault();
  }

  function handleGlobalShortcuts(event) {
    if (!event.ctrlKey || event.key !== "Backspace" || event.altKey || event.metaKey) return;
    if (isFormInput(event.target)) return;
    event.preventDefault();
    clearAll();
  }

  function isFormInput(target) {
    if (!(target instanceof HTMLElement)) return false;
    return target.isContentEditable || ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName);
  }

  function renderAll() {
    renderPalette();
    renderHand();
    renderCounts();
    renderWinTileOptions();
    renderActionButtons();
    analyzeAndRender();
  }

  function renderPalette() {
    const counts = visibleCounts();
    els.tilePalette.innerHTML = TILE_DEFS.map((tile) => {
      const count = counts[tile.id];
      const disabled = count >= 4 || effectiveTileCount() >= 14;
      return `
        <button class="tile-button ${tile.className}" type="button" data-tile="${tile.id}" ${disabled ? "disabled" : ""} aria-label="${tile.name}">
          ${tile.label}
          <span class="tile-count">${count}</span>
        </button>
      `;
    }).join("");
  }

  function renderHand() {
    const sorted = sortedConcealed();
    els.handTiles.innerHTML = sorted.map((item) => {
      const tile = TILE_DEFS[item.tile];
      const selected = state.selectedIds.has(item.id) ? "selected" : "";
      const meld = item.meldId ? state.melds.find((entry) => entry.id === item.meldId) : null;
      const meldClass = meld ? `meld-tile meld-${meld.type}` : "";
      const meldTag = meld ? `<span class="meld-tag">${meldLabel(meld.type)}</span>` : "";
      return `
        <button class="hand-tile ${tile.className} ${selected} ${meldClass}" type="button" draggable="true" data-id="${item.id}" aria-label="${tile.name}${meld ? `，${meldLabel(meld.type)}` : ""}">
          ${tile.label}
          ${meldTag}
        </button>
      `;
    }).join("");
  }

  function renderCounts() {
    els.physicalCount.textContent = `实体 ${physicalTileCount()}`;
    els.effectiveCount.textContent = `有效 ${effectiveTileCount()}`;
  }

  function renderWinTileOptions() {
    const current = state.selectedWinTile;
    const candidateTiles = uniqueTiles(concealedTileIds());
    els.winTileSelect.innerHTML = `<option value="">自动</option>${candidateTiles.map((tileId) => {
      const tile = TILE_DEFS[tileId];
      return `<option value="${tileId}">${tile.name}</option>`;
    }).join("")}`;
    if (candidateTiles.includes(Number(current))) {
      els.winTileSelect.value = current;
    } else {
      state.selectedWinTile = "";
      els.winTileSelect.value = "";
    }
  }

  function renderActionButtons() {
    els.makeChi.disabled = !canMakeMeld("chi");
    els.makePeng.disabled = !canMakeMeld("peng");
    els.makeMingGang.disabled = !canMakeMeld("minggang");
    els.makeAnGang.disabled = !canMakeMeld("angang");
    els.clearMeld.disabled = !selectedItems().some((item) => item.meldId);
    els.clearSelection.disabled = state.selectedIds.size === 0;
    els.undoTile.disabled = state.concealed.length === 0;
  }

  function addConcealedTile(tile) {
    if (visibleCounts()[tile] >= 4 || effectiveTileCount() >= 14) return;
    state.concealed.push({ id: state.nextId, tile });
    state.nextId += 1;
    renderAll();
  }

  function undoLastTile() {
    const removed = state.concealed[state.concealed.length - 1];
    if (!removed) return;
    if (removed.meldId) removeMeldMark(removed.meldId);
    state.concealed.pop();
    state.selectedIds.delete(removed.id);
    renderAll();
  }

  function clearAll() {
    state.concealed = [];
    state.selectedIds.clear();
    state.melds = [];
    state.nextId = 1;
    state.nextMeldId = 1;
    state.selectedWinTile = "";
    state.draggedTileId = null;
    state.lastHandTap = { id: null, time: 0 };
    renderAll();
  }

  function toggleSelected(id) {
    if (state.selectedIds.has(id)) {
      state.selectedIds.delete(id);
    } else {
      state.selectedIds.add(id);
    }
    renderAll();
  }

  function makeMeld(type) {
    if (!canMakeMeld(type)) return;
    const selected = selectedItems();
    const tiles = selected.map((item) => item.tile).sort((a, b) => a - b);
    const meldId = state.nextMeldId;
    const itemIds = selected.map((item) => item.id);
    selected.forEach((item) => {
      item.meldId = meldId;
    });
    state.selectedIds.clear();
    state.melds.push({
      id: meldId,
      type,
      itemIds,
      tiles
    });
    state.nextMeldId += 1;
    renderAll();
  }

  function clearSelectedMelds() {
    const ids = new Set(selectedItems().map((item) => item.meldId).filter(Boolean));
    ids.forEach(removeMeldMark);
    state.selectedIds.clear();
    renderAll();
  }

  function removeMeldMark(id) {
    const index = state.melds.findIndex((meld) => meld.id === id);
    if (index < 0) return;
    const [meld] = state.melds.splice(index, 1);
    const itemIdSet = new Set(meld.itemIds);
    state.concealed.forEach((item) => {
      if (!itemIdSet.has(item.id)) return;
      delete item.meldId;
    });
  }

  function removeTileById(id) {
    const item = state.concealed.find((entry) => entry.id === id);
    if (!item) return;
    if (item.meldId) removeMeldMark(item.meldId);
    state.concealed = state.concealed.filter((entry) => entry.id !== id);
    state.selectedIds.delete(id);
    if (state.lastHandTap.id === id) state.lastHandTap = { id: null, time: 0 };
    renderAll();
  }

  function canMakeMeld(type) {
    const selected = selectedItems();
    if (selected.some((item) => item.meldId)) return false;
    const tiles = selected.map((item) => item.tile).sort((a, b) => a - b);
    if (type === "chi") return tiles.length === 3 && isSequenceTiles(tiles);
    if (type === "peng") return tiles.length === 3 && allSame(tiles);
    return tiles.length === 4 && allSame(tiles);
  }

  function selectedItems() {
    return state.concealed.filter((item) => state.selectedIds.has(item.id));
  }

  function sortedConcealed() {
    return [...state.concealed].sort((a, b) => a.tile - b.tile || a.id - b.id);
  }

  function tileChip(tileId) {
    const tile = TILE_DEFS[tileId];
    return `<span class="mini-tile ${tile.className}">${tile.label}</span>`;
  }

  function meldLabel(type) {
    return {
      chi: "吃",
      peng: "碰",
      minggang: "明杠",
      angang: "暗杠"
    }[type];
  }

  function analyzeAndRender() {
    const ctx = readContext();
    const effective = effectiveTileCount();
    if (effective < 13) {
      renderStatus("warn", "还不能分析", `还差 ${13 - effective} 张有效牌。`);
      return;
    }
    if (effective > 14) {
      renderStatus("bad", "有效张数过多", "请删除多余牌或清除部分标记。");
      return;
    }
    if (effective === 13) {
      renderListening(ctx);
      return;
    }
    renderCompleteHand(ctx);
  }

  function renderListening(ctx) {
    const counts = visibleCounts();
    const results = [];
    for (let tile = 0; tile < 34; tile += 1) {
      if (counts[tile] >= 4) continue;
      const evalResult = evaluateHand([...concealedTileIds(), tile], state.melds, tile, ctx);
      if (evalResult.isWin) {
        results.push({
          tile,
          score: evalResult.best
        });
      }
    }
    results.sort((a, b) => b.score.total - a.score.total || a.tile - b.tile);
    if (!results.length) {
      renderStatus("bad", "未听牌", "当前 13 张没有可和张。");
      return;
    }
    const cards = results.map((item) => scoreCard(`${TILE_DEFS[item.tile].name}`, item.score)).join("");
    els.result.innerHTML = `
      <div class="status-block">
        <h3>听 ${results.length} 张</h3>
        <p>${results.map((item) => TILE_DEFS[item.tile].name).join("、")}</p>
      </div>
      <div class="win-list">${cards}</div>
      ${coverageNote()}
    `;
  }

  function renderCompleteHand(ctx) {
    const selected = state.selectedWinTile === "" ? null : Number(state.selectedWinTile);
    const concealedCounts = countsFromTiles(concealedTileIds());
    const possibleWinTiles = selected === null
      ? uniqueTiles(concealedTileIds())
      : concealedCounts[selected] > 0
        ? [selected]
        : [];

    const results = possibleWinTiles.map((tile) => ({
      tile,
      score: evaluateHand(concealedTileIds(), state.melds, tile, ctx).best
    })).filter((item) => item.score);

    if (!results.length) {
      renderStatus("bad", "尚不能胡", selected === null ? "当前 14 张不能拆成国标基本胡型、七对或十三幺。" : "所选和牌张下不能胡。");
      return;
    }
    results.sort((a, b) => b.score.total - a.score.total || a.tile - b.tile);
    const best = results[0];
    const statusClass = best.score.baseTotal >= MIN_FAN ? "" : "warn";
    const statusTitle = best.score.baseTotal >= MIN_FAN ? "当前可胡" : "牌型可胡，但未满 8 番";
    const cards = results.map((item) => scoreCard(`和牌张：${TILE_DEFS[item.tile].name}`, item.score)).join("");
    els.result.innerHTML = `
      <div class="status-block ${statusClass}">
        <h3>${statusTitle}</h3>
        <p>${scoreSummary(best.score)}，按 ${TILE_DEFS[best.tile].name} 计。</p>
      </div>
      <div class="win-list">${cards}</div>
      ${coverageNote()}
    `;
  }

  function renderStatus(kind, title, body) {
    els.result.innerHTML = `
      <div class="status-block ${kind}">
        <h3>${title}</h3>
        <p>${body}</p>
      </div>
      ${coverageNote()}
    `;
  }

  function scoreCard(title, score) {
    const good = score.baseTotal >= MIN_FAN;
    const fanItems = score.fans.map((fan) => `<li>${fan.name}${fan.count > 1 ? ` x${fan.count}` : ""} ${fan.value}番</li>`).join("");
    return `
      <article class="win-card ${good ? "good" : "low"}">
        <div class="fan-total">
          <h3>${title}</h3>
          <strong>${score.total}番</strong>
        </div>
        <p>${good ? "满足国标起胡" : "未满 8 番"}${score.total !== score.baseTotal ? `，起胡计 ${score.baseTotal} 番` : ""}</p>
        <ul class="fan-breakdown">${fanItems}</ul>
      </article>
    `;
  }

  function scoreSummary(score) {
    if (score.total === score.baseTotal) return `最高 ${score.total} 番`;
    return `最高 ${score.total} 番，起胡计 ${score.baseTotal} 番`;
  }

  function coverageNote() {
    return `<p class="muted-note">已覆盖全不靠、七星不靠、组合龙、推不倒；比赛场景仍建议按裁判规则复核复杂“不计”细则。</p>`;
  }

  function readContext() {
    return {
      selfDraw: document.querySelector("input[name='winFrom']:checked").value === "zimo",
      roundWind: Number(els.roundWind.value),
      seatWind: Number(els.seatWind.value),
      flowerCount: clamp(Number(els.flowerCount.value || 0), 0, 8),
      lastDraw: els.lastDraw.checked,
      lastDiscard: els.lastDiscard.checked,
      kongDraw: els.kongDraw.checked,
      robKong: els.robKong.checked,
      lastTile: els.lastTile.checked
    };
  }

  function evaluateHand(concealedTiles, melds, winTile, ctx) {
    const wins = enumerateWins(concealedTiles, melds);
    if (!wins.length) return { isWin: false, best: null, all: [] };
    const scored = wins.map((win) => scoreWin(win, concealedTiles, melds, winTile, ctx));
    scored.sort((a, b) => b.total - a.total);
    return { isWin: true, best: scored[0], all: scored };
  }

  function enumerateWins(concealedTiles, melds) {
    const fixedGroups = melds.map(meldToGroup);
    const counts = countsFromTiles(concealedTiles);
    const wins = [];
    const concealedTotal = concealedTiles.length;
    const neededSets = 4 - fixedGroups.length;

    if (melds.length === 0 && concealedTotal === 14) {
      if (isThirteenOrphans(counts)) {
        wins.push({ kind: "thirteen", groups: [], pair: null });
      }
      if (isSevenPairs(counts)) {
        wins.push({ kind: "sevenPairs", groups: [], pair: null });
      }
      if (isSevenStarUnconnected(counts)) {
        wins.push({ kind: "sevenStarUnconnected", groups: [], pair: null });
      } else if (isAllUnconnected(counts)) {
        wins.push({ kind: "allUnconnected", groups: [], pair: null });
      }
    }

    enumerateCombinationDragonWins(counts, fixedGroups).forEach((win) => wins.push(win));

    if (neededSets >= 0 && concealedTotal === neededSets * 3 + 2) {
      for (let pairTile = 0; pairTile < 34; pairTile += 1) {
        if (counts[pairTile] < 2) continue;
        counts[pairTile] -= 2;
        const found = [];
        searchMeldPartitions(counts, neededSets, [], found);
        found.forEach((groups) => {
          wins.push({
            kind: "standard",
            groups: [...fixedGroups, ...groups],
            pair: { tile: pairTile }
          });
        });
        counts[pairTile] += 2;
      }
    }
    return wins.slice(0, MAX_ENUMERATED_WAYS);
  }

  function searchMeldPartitions(counts, setsLeft, current, found) {
    if (found.length >= MAX_ENUMERATED_WAYS) return;
    const first = counts.findIndex((count) => count > 0);
    if (first === -1) {
      if (setsLeft === 0) found.push(current.map(cloneGroup));
      return;
    }
    if (setsLeft <= 0) return;

    if (counts[first] >= 3) {
      counts[first] -= 3;
      current.push({
        kind: "triplet",
        tile: first,
        tiles: [first, first, first],
        open: false,
        concealed: true
      });
      searchMeldPartitions(counts, setsLeft - 1, current, found);
      current.pop();
      counts[first] += 3;
    }

    if (isSuit(first)) {
      const rank = tileRank(first);
      if (rank <= 7 && counts[first + 1] > 0 && counts[first + 2] > 0 && tileSuit(first + 2) === tileSuit(first)) {
        counts[first] -= 1;
        counts[first + 1] -= 1;
        counts[first + 2] -= 1;
        current.push({
          kind: "seq",
          suit: tileSuit(first),
          start: rank,
          tiles: [first, first + 1, first + 2],
          open: false,
          concealed: true
        });
        searchMeldPartitions(counts, setsLeft - 1, current, found);
        current.pop();
        counts[first] += 1;
        counts[first + 1] += 1;
        counts[first + 2] += 1;
      }
    }
  }

  function enumerateCombinationDragonWins(counts, fixedGroups) {
    if (fixedGroups.length > 1) return [];
    const wins = [];
    combinationDragonPatterns().forEach((dragonTiles) => {
      if (!dragonTiles.every((tile) => counts[tile] > 0)) return;
      const remaining = [...counts];
      dragonTiles.forEach((tile) => {
        remaining[tile] -= 1;
      });
      const setsNeeded = 1 - fixedGroups.length;
      if (sumCountsArray(remaining) !== setsNeeded * 3 + 2) return;

      for (let pairTile = 0; pairTile < 34; pairTile += 1) {
        if (remaining[pairTile] < 2) continue;
        remaining[pairTile] -= 2;
        if (setsNeeded === 0) {
          if (sumCountsArray(remaining) === 0) {
            wins.push({
              kind: "combinationDragon",
              dragonTiles,
              groups: [...fixedGroups],
              pair: { tile: pairTile }
            });
          }
        } else {
          const found = [];
          searchMeldPartitions(remaining, setsNeeded, [], found);
          found.forEach((groups) => {
            wins.push({
              kind: "combinationDragon",
              dragonTiles,
              groups: [...fixedGroups, ...groups],
              pair: { tile: pairTile }
            });
          });
        }
        remaining[pairTile] += 2;
      }
    });
    return wins;
  }

  function isAllUnconnected(counts) {
    return sumCountsArray(counts) === 14 && counts.every((count) => count <= 1) && Boolean(matchingKnittedPattern(counts));
  }

  function isSevenStarUnconnected(counts) {
    if (!isAllUnconnected(counts)) return false;
    return WIND_NAMES.every((_, index) => counts[27 + index] === 1) &&
      DRAGON_NAMES.every((_, index) => counts[31 + index] === 1);
  }

  function hasCombinationDragonPattern(counts) {
    return combinationDragonPatterns().some((tiles) => tiles.every((tile) => counts[tile] > 0));
  }

  function matchingKnittedPattern(counts) {
    return combinationDragonPatterns().find((tiles) => {
      const tileSet = new Set(tiles);
      for (let tile = 0; tile < 27; tile += 1) {
        if (counts[tile] > 0 && !tileSet.has(tile)) return false;
      }
      return true;
    });
  }

  function combinationDragonPatterns() {
    const rankGroups = [
      [1, 4, 7],
      [2, 5, 8],
      [3, 6, 9]
    ];
    return suitPermutations().map((suits) => {
      const tiles = [];
      rankGroups.forEach((ranks, index) => {
        ranks.forEach((rank) => {
          tiles.push(suits[index] * 9 + rank - 1);
        });
      });
      return tiles;
    });
  }

  function suitPermutations() {
    return [
      [0, 1, 2], [0, 2, 1], [1, 0, 2],
      [1, 2, 0], [2, 0, 1], [2, 1, 0]
    ];
  }

  function sumCountsArray(counts) {
    return counts.reduce((sum, count) => sum + count, 0);
  }

  function scoreWin(win, concealedTiles, melds, winTile, ctx) {
    const physicalTiles = [...concealedTiles, ...melds.flatMap((meld) => meld.tiles)];
    const physicalCounts = countsFromTiles(physicalTiles);
    const fanMap = new Map();
    const add = (key, name, value, count = 1) => addFan(fanMap, key, name, value, count);

    if (win.kind === "thirteen") {
      add("SHISANYAO", "十三幺", 88);
      addContextFans(add, ctx, melds, win, winTile, true);
      return finalizeFans(fanMap);
    }

    if (win.kind === "sevenPairs") {
      addSevenPairFans(add, physicalCounts, physicalTiles);
      addCompositionFans(add, physicalTiles, physicalCounts);
      addQuadReturnFans(add, physicalCounts, melds);
      addClosedFans(add, ctx, melds);
      addContextFans(add, ctx, melds, win, winTile, false);
      applyExclusions(fanMap);
      return finalizeFans(fanMap);
    }

    if (win.kind === "sevenStarUnconnected" || win.kind === "allUnconnected") {
      if (win.kind === "sevenStarUnconnected") {
        add("QIXINGBUKAO", "七星不靠", 24);
      } else {
        add("QUANBUKAO", "全不靠", 12);
        if (hasCombinationDragonPattern(physicalCounts)) add("ZUHELONG", "组合龙", 12);
      }
      addCompositionFans(add, physicalTiles, physicalCounts);
      addContextFans(add, ctx, melds, win, winTile, false);
      applyExclusions(fanMap);
      return finalizeFans(fanMap);
    }

    if (win.kind === "combinationDragon") {
      add("ZUHELONG", "组合龙", 12);
      scoreReducedMeldHand(add, win, physicalTiles, physicalCounts, melds, winTile, ctx);
      applyExclusions(fanMap);
      return finalizeFans(fanMap);
    }

    const groups = win.groups;
    const pair = win.pair;
    const seqs = groups.filter((group) => group.kind === "seq");
    const triplets = groups.filter((group) => group.kind === "triplet" || group.kind === "kong");
    const kongs = groups.filter((group) => group.kind === "kong");
    const windTriplets = triplets.filter((group) => isWind(group.tile));
    const dragonTriplets = triplets.filter((group) => isDragon(group.tile));
    const hiddenTripletCount = triplets.filter((group) => isConcealedTriplet(group, winTile, ctx, pair)).length;
    const hiddenKongCount = kongs.filter((group) => !group.open).length;
    const openKongCount = kongs.filter((group) => group.open).length;

    addHighStandardFans(add, groups, pair, physicalTiles, physicalCounts, ctx, melds, winTile, hiddenTripletCount);
    addSequenceFans(add, seqs, groups, pair);
    addTripletFans(add, triplets, pair, hiddenTripletCount);
    addCompositionFans(add, physicalTiles, physicalCounts);
    addShapeFans(add, groups, pair, physicalTiles, ctx);
    addValuePungFans(add, windTriplets, dragonTriplets, ctx);
    addKongFans(add, kongs.length, hiddenKongCount, openKongCount);
    addWaitFans(add, groups, pair, winTile);
    addQuadReturnFans(add, physicalCounts, melds);
    addClosedFans(add, ctx, melds);
    addContextFans(add, ctx, melds, win, winTile, false);

    applyExclusions(fanMap);
    if (sumFanMap(fanMap) === 0) {
      add("WUFANHU", "无番和", 8);
    }
    return finalizeFans(fanMap);
  }

  function scoreReducedMeldHand(add, win, physicalTiles, physicalCounts, melds, winTile, ctx) {
    const groups = win.groups;
    const pair = win.pair;
    const seqs = groups.filter((group) => group.kind === "seq");
    const triplets = groups.filter((group) => group.kind === "triplet" || group.kind === "kong");
    const kongs = groups.filter((group) => group.kind === "kong");
    const windTriplets = triplets.filter((group) => isWind(group.tile));
    const dragonTriplets = triplets.filter((group) => isDragon(group.tile));
    const hiddenTripletCount = triplets.filter((group) => isConcealedTriplet(group, winTile, ctx, pair)).length;
    const hiddenKongCount = kongs.filter((group) => !group.open).length;
    const openKongCount = kongs.filter((group) => group.open).length;

    addCompositionFans(add, physicalTiles, physicalCounts);
    if (groups.length > 0 && groups.every((group) => group.kind === "seq") && pair && isSuit(pair.tile)) {
      add("PINGHU", "平和", 2);
    }
    addValuePungFans(add, windTriplets, dragonTriplets, ctx);
    addTripletFans(add, triplets, pair, hiddenTripletCount);
    addKongFans(add, kongs.length, hiddenKongCount, openKongCount);
    addWaitFans(add, groups, pair, winTile);
    addQuadReturnFans(add, physicalCounts, melds);
    addClosedFans(add, ctx, melds);
    addContextFans(add, ctx, melds, win, winTile, false);
  }

  function addHighStandardFans(add, groups, pair, physicalTiles, physicalCounts, ctx, melds, winTile, hiddenTripletCount) {
    const triplets = groups.filter((group) => group.kind === "triplet" || group.kind === "kong");
    const seqs = groups.filter((group) => group.kind === "seq");
    const windTripletCount = triplets.filter((group) => isWind(group.tile)).length;
    const dragonTripletCount = triplets.filter((group) => isDragon(group.tile)).length;
    const kongCount = groups.filter((group) => group.kind === "kong").length;

    if (windTripletCount === 4) add("DASIXI", "大四喜", 88);
    if (dragonTripletCount === 3) add("DASANYUAN", "大三元", 88);
    if (physicalTiles.every(isGreenTile)) add("LVYISE", "绿一色", 88);
    if (isNineGates(physicalCounts) && noOpenMelds(melds)) add("JIULIAN", "九莲宝灯", 88);
    if (kongCount === 4) add("SIGANG", "四杠", 88);

    if (windTripletCount === 3 && pair && isWind(pair.tile)) add("XIAOSIXI", "小四喜", 64);
    if (dragonTripletCount === 2 && pair && isDragon(pair.tile)) add("XIAOSANYUAN", "小三元", 64);
    if (physicalTiles.every(isHonor)) add("ZIYISE", "字一色", 64);
    if (physicalTiles.every(isTerminal)) add("QINGYAOJIU", "清幺九", 64);
    if (triplets.length === 4 && hiddenTripletCount === 4 && noOpenMelds(melds)) {
      add("SIANKE", "四暗刻", 64);
    }
    if (isPureDoubleDragon(seqs, pair)) add("YISESHUANGLONGHUI", "一色双龙会", 64);

    if (hasSameSequenceCount(seqs, 4)) add("YISESITONGSHUN", "一色四同顺", 48);
    if (hasConsecutiveTriplets(triplets, 4, true)) add("YISESIJIEGAO", "一色四节高", 48);

    if (hasFourStepChows(seqs)) add("YISESIBUGAO", "一色四步高", 32);
    if (kongCount === 3) add("SANGANG", "三杠", 32);
    if (physicalTiles.every(isTerminalOrHonor)) add("HUNYAOJIU", "混幺九", 32);

    if (isAllEvenPungs(groups, pair)) add("QUANSHUANGKE", "全双刻", 24);
    if (hasSameSequenceCount(seqs, 3)) add("YISESANTONGSHUN", "一色三同顺", 24);
    if (hasConsecutiveTriplets(triplets, 3, true)) add("YISESANJIEGAO", "一色三节高", 24);
    if (physicalTiles.every((tile) => isSuit(tile) && tileRank(tile) >= 7)) add("QUANDA", "全大", 24);
    if (physicalTiles.every((tile) => isSuit(tile) && tileRank(tile) >= 4 && tileRank(tile) <= 6)) add("QUANZHONG", "全中", 24);
    if (physicalTiles.every((tile) => isSuit(tile) && tileRank(tile) <= 3)) add("QUANXIAO", "全小", 24);

    if (hasPureStraight(seqs)) add("QINGLONG", "清龙", 16);
    if (isMixedDoubleDragon(seqs, pair)) add("SANSESHUANGLONGHUI", "三色双龙会", 16);
    if (hasThreeStepChowsSameSuit(seqs)) add("YISESANBUGAO", "一色三步高", 16);
    if (groupsAndPairEvery(groups, pair, groupContainsFive, (tile) => isSuit(tile) && tileRank(tile) === 5)) add("QUANDAIWU", "全带五", 16);
    if (hasSameRankTriplets(triplets, 3)) add("SANTONGKE", "三同刻", 16);

    if (windTripletCount === 3) add("SANFENGKE", "三风刻", 12);
    if (physicalTiles.every((tile) => isSuit(tile) && tileRank(tile) > 5)) add("DAYUWU", "大于五", 12);
    if (physicalTiles.every((tile) => isSuit(tile) && tileRank(tile) < 5)) add("XIAOYUWU", "小于五", 12);
  }

  function addSequenceFans(add, seqs) {
    if (hasFlowerDragon(seqs)) add("HUALONG", "花龙", 8);
    if (hasMixedSameChows(seqs)) add("SANSESANTONGSHUN", "三色三同顺", 8);
    if (hasThreeStepChowsMixed(seqs)) add("SANSESANBUGAO", "三色三步高", 6);

    const samePairs = countSameSequencePairs(seqs);
    if (samePairs > 0) add("YIBANGAO", "一般高", samePairs, samePairs);

    const crossPairs = countCrossSuitSequencePairs(seqs);
    if (crossPairs > 0) add("XIXIANGFENG", "喜相逢", crossPairs, crossPairs);

    const linkedSix = countLinkedSix(seqs);
    if (linkedSix > 0) add("LIANLIU", "连六", linkedSix, linkedSix);

    const terminalPairs = countTerminalChowPairs(seqs);
    if (terminalPairs > 0) add("LAOSHAOFU", "老少副", terminalPairs, terminalPairs);
  }

  function addTripletFans(add, triplets, pair, hiddenTripletCount) {
    if (triplets.length === 4) add("PENGPENGHU", "碰碰和", 6);
    if (hiddenTripletCount >= 3) add("SANANKE", "三暗刻", 16);
    if (hiddenTripletCount === 2) add("SHUANGANKE", "双暗刻", 2);
    if (hasMixedShiftedTriplets(triplets)) add("SANSESANJIEGAO", "三色三节高", 8);

    const doublePungs = countSameRankTripletPairs(triplets);
    if (doublePungs > 0) add("SHUANGTONGKE", "双同刻", 2 * doublePungs, doublePungs);

    const terminalHonorPungs = triplets.filter((group) => isTerminalOrHonor(group.tile)).length;
    if (terminalHonorPungs > 0) add("YAOJIUKE", "幺九刻", terminalHonorPungs, terminalHonorPungs);
  }

  function addCompositionFans(add, physicalTiles) {
    const suits = new Set(physicalTiles.filter(isSuit).map(tileSuit));
    const hasHonors = physicalTiles.some(isHonor);
    if (suits.size === 1 && !hasHonors) add("QINGYISE", "清一色", 24);
    if (suits.size === 1 && hasHonors) add("HUNYISE", "混一色", 6);
    if (hasFiveGates(physicalTiles)) add("WUMENQI", "五门齐", 6);
    if (physicalTiles.every(isReversibleTile)) add("TUIBUDAO", "推不倒", 8);
    if (physicalTiles.every(isSimple)) add("DUANYAO", "断幺", 2);
    if (!hasHonors) add("WUZI", "无字", 1);
    if (suits.size < 3 && suits.size > 0) add("QUEYIMEN", "缺一门", 1);
  }

  function addShapeFans(add, groups, pair, physicalTiles, ctx) {
    const seqs = groups.filter((group) => group.kind === "seq");
    if (seqs.length === 4 && pair && isSuit(pair.tile)) add("PINGHU", "平和", 2);
    if (groupsAndPairEvery(groups, pair, groupContainsTerminalOrHonor, isTerminalOrHonor)) add("QUANDAIYAO", "全带幺", 4);
    if (groups.filter((group) => group.open).length === 4 && pair && !ctx.selfDraw) add("QUANQIUREN", "全求人", 6);
  }

  function addValuePungFans(add, windTriplets, dragonTriplets, ctx) {
    if (dragonTriplets.length === 2) {
      add("SHUANGJIANKE", "双箭刻", 6);
    } else if (dragonTriplets.length === 1) {
      add("JIANKE", "箭刻", 2);
    }

    windTriplets.forEach((group) => {
      if (group.tile === ctx.roundWind) add("QUANFENGKE", "圈风刻", 2);
      if (group.tile === ctx.seatWind) add("MENFENGKE", "门风刻", 2);
    });
  }

  function addKongFans(add, kongCount, hiddenKongCount, openKongCount) {
    if (hiddenKongCount >= 2) add("SHUANGANGANG", "双暗杠", 6);
    else if (hiddenKongCount === 1) add("ANGANG", "暗杠", 2);

    if (openKongCount >= 2) add("SHUANGMINGGANG", "双明杠", 4);
    else if (openKongCount === 1) add("MINGGANG", "明杠", 1);

    if (kongCount === 0) return;
  }

  function addWaitFans(add, groups, pair, winTile) {
    if (winTile === null || winTile === undefined) return;
    if (pair && pair.tile === winTile) {
      add("DANDIAO", "单钓将", 1);
      return;
    }
    const possible = [];
    groups.filter((group) => group.kind === "seq").forEach((group) => {
      if (!group.tiles.includes(winTile)) return;
      const rank = tileRank(winTile);
      if ((group.start === 1 && rank === 3) || (group.start === 7 && rank === 7)) possible.push("边张");
      if (rank === group.start + 1) possible.push("坎张");
    });
    if (possible.includes("边张")) add("BIANZHANG", "边张", 1);
    else if (possible.includes("坎张")) add("KANZHANG", "坎张", 1);
  }

  function addQuadReturnFans(add, physicalCounts, melds) {
    const kongTiles = new Set(melds.filter((meld) => meld.type === "minggang" || meld.type === "angang").map((meld) => meld.tiles[0]));
    let count = 0;
    physicalCounts.forEach((tileCount, tile) => {
      if (tileCount === 4 && !kongTiles.has(tile)) count += 1;
    });
    if (count > 0) add("SIGUIYI", "四归一", 2 * count, count);
  }

  function addClosedFans(add, ctx, melds) {
    if (!noOpenMelds(melds)) return;
    if (ctx.selfDraw) add("BUQIUREN", "不求人", 4);
    else add("MENQIANQING", "门前清", 2);
  }

  function addContextFans(add, ctx, melds, win, winTile, limitShapeFans) {
    if (ctx.lastDraw) add("MIAOSHOUHUICHUN", "妙手回春", 8);
    if (ctx.lastDiscard) add("HAIDILAOYUE", "海底捞月", 8);
    if (ctx.kongDraw) add("GANGSHANGKAIHUA", "杠上开花", 8);
    if (ctx.robKong) add("QIANGGANGHU", "抢杠和", 8);
    if (ctx.lastTile) add("HEJUEZHANG", "和绝张", 4);
    if (ctx.selfDraw) add("ZIMO", "自摸", 1);
    if (ctx.flowerCount > 0) add("HUAPAI", "花牌", ctx.flowerCount, ctx.flowerCount);
  }

  function addSevenPairFans(add, counts, physicalTiles) {
    if (isConsecutiveSevenPairs(counts)) add("LIANQIDUI", "连七对", 88);
    else add("QIDUI", "七对", 24);
  }

  function applyExclusions(fanMap) {
    const has = (key) => fanMap.has(key);
    const remove = (...keys) => keys.forEach((key) => fanMap.delete(key));

    if (has("SHISANYAO")) {
      remove("WUMENQI", "MENQIANQING", "BUQIUREN", "WUZI", "QUEYIMEN");
    }
    if (has("QIXINGBUKAO")) {
      remove("QUANBUKAO", "WUMENQI", "MENQIANQING", "BUQIUREN", "DANDIAO");
    }
    if (has("QUANBUKAO")) {
      remove("WUMENQI", "MENQIANQING", "BUQIUREN", "DANDIAO");
    }
    if (has("ZUHELONG")) {
      remove("XIXIANGFENG", "LIANLIU");
    }
    if (has("TUIBUDAO")) {
      remove("QUEYIMEN");
    }
    if (has("LIANQIDUI")) {
      remove("QIDUI", "QINGYISE", "YIBANGAO", "PINGHU", "MENQIANQING", "BUQIUREN", "DANDIAO", "WUZI", "QUEYIMEN", "SIGUIYI");
    }
    if (has("QIDUI")) {
      remove("PINGHU", "MENQIANQING", "BUQIUREN", "DANDIAO");
    }
    if (has("JIULIAN")) {
      remove("QINGYISE", "MENQIANQING", "BUQIUREN", "WUZI", "QUEYIMEN");
    }
    if (has("QINGYAOJIU")) {
      remove("PENGPENGHU", "HUNYAOJIU", "SANTONGKE", "SHUANGTONGKE", "WUZI");
    }
    if (has("DASIXI")) {
      remove("XIAOSIXI", "SANFENGKE", "PENGPENGHU", "QUANFENGKE", "MENFENGKE", "YAOJIUKE");
    }
    if (has("XIAOSIXI")) {
      remove("SANFENGKE", "QUANFENGKE", "MENFENGKE", "YAOJIUKE");
    }
    if (has("DASANYUAN") || has("XIAOSANYUAN")) {
      remove("SHUANGJIANKE", "JIANKE", "YAOJIUKE");
    }
    if (has("ZIYISE")) {
      remove("HUNYISE", "PENGPENGHU", "HUNYAOJIU", "QUANDAIYAO", "YAOJIUKE", "QUEYIMEN");
    }
    if (has("SIANKE")) {
      remove("SANANKE", "SHUANGANKE", "PENGPENGHU", "BUQIUREN", "MENQIANQING");
    }
    if (has("SIGANG") || has("SANGANG")) {
      remove("SHUANGANGANG", "SHUANGMINGGANG", "ANGANG", "MINGGANG", "PENGPENGHU", "DANDIAO");
    }
    if (has("LVYISE")) {
      remove("HUNYISE");
    }
    if (has("YISESHUANGLONGHUI")) {
      remove("LAOSHAOFU", "YIBANGAO", "QINGYISE", "PINGHU", "QUEYIMEN");
    }
    if (has("YISESITONGSHUN")) {
      remove("YISESANTONGSHUN", "YIBANGAO", "SANSESANTONGSHUN", "XIXIANGFENG", "SIGUIYI");
    }
    if (has("YISESANTONGSHUN")) {
      remove("YIBANGAO");
    }
    if (has("YISESIJIEGAO")) {
      remove("YISESANJIEGAO", "PENGPENGHU", "YAOJIUKE");
    }
    if (has("YISESIBUGAO")) {
      remove("YISESANBUGAO", "LIANLIU", "LAOSHAOFU");
    }
    if (has("YISESANJIEGAO")) {
      remove("YAOJIUKE");
    }
    if (has("HUNYAOJIU")) {
      remove("PENGPENGHU", "QUANDAIYAO", "YAOJIUKE");
    }
    if (has("QUANSHUANGKE")) {
      remove("PENGPENGHU", "DUANYAO", "WUZI");
    }
    if (has("QINGYISE")) {
      remove("WUZI", "QUEYIMEN");
    }
    if (has("HUNYISE")) {
      remove("QUEYIMEN");
    }
    if (has("QUANDA") || has("QUANZHONG") || has("QUANXIAO")) {
      remove("DAYUWU", "XIAOYUWU", "WUZI", "QUEYIMEN");
    }
    if (has("DAYUWU") || has("XIAOYUWU")) {
      remove("WUZI");
    }
    if (has("QINGLONG")) {
      remove("LIANLIU", "LAOSHAOFU");
    }
    if (has("HUALONG")) {
      remove("XIXIANGFENG");
    }
    if (has("SANSESANTONGSHUN")) {
      remove("XIXIANGFENG");
    }
    if (has("SANTONGKE")) {
      remove("SHUANGTONGKE");
    }
    if (has("PENGPENGHU")) {
      remove("PINGHU");
    }
    if (has("QUANDAIYAO")) {
      remove("YAOJIUKE");
    }
    if (has("QUANQIUREN")) {
      remove("DANDIAO");
    }
    if (has("BUQIUREN")) {
      remove("MENQIANQING", "ZIMO");
    }
    if (has("MIAOSHOUHUICHUN") || has("GANGSHANGKAIHUA")) {
      remove("ZIMO");
    }
    if (has("DUANYAO")) {
      remove("WUZI");
    }
    if (has("PINGHU")) {
      remove("WUZI");
    }
    if (has("QIANGGANGHU")) {
      remove("HEJUEZHANG");
    }
  }

  function finalizeFans(fanMap) {
    const fans = [...fanMap.values()].sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, "zh-CN"));
    const total = fans.reduce((sum, fan) => sum + fan.value, 0);
    const baseTotal = fans.reduce((sum, fan) => sum + (fan.key === "HUAPAI" ? 0 : fan.value), 0);
    return {
      fans,
      total,
      baseTotal
    };
  }

  function addFan(fanMap, key, name, value, count) {
    if (fanMap.has(key)) {
      const existing = fanMap.get(key);
      existing.value += value;
      existing.count += count;
      return;
    }
    fanMap.set(key, { key, name, value, count });
  }

  function sumFanMap(fanMap) {
    return [...fanMap.values()].reduce((sum, fan) => sum + fan.value, 0);
  }

  function isSevenPairs(counts) {
    let pairCount = 0;
    for (const count of counts) {
      if (count % 2 !== 0) return false;
      pairCount += count / 2;
    }
    return pairCount === 7;
  }

  function isConsecutiveSevenPairs(counts) {
    for (let suit = 0; suit < 3; suit += 1) {
      const start = suit * 9;
      const suitCounts = counts.slice(start, start + 9);
      if (suitCounts.every((count) => count === 0 || count === 2) && suitCounts.filter((count) => count === 2).length === 7) {
        const first = suitCounts.findIndex((count) => count === 2);
        if (first >= 0 && first <= 2) {
          const segment = suitCounts.slice(first, first + 7);
          if (segment.length === 7 && segment.every((count) => count === 2)) return true;
        }
      }
    }
    return false;
  }

  function isThirteenOrphans(counts) {
    const required = thirteenTiles();
    let duplicateFound = false;
    for (let tile = 0; tile < 34; tile += 1) {
      const count = counts[tile];
      if (required.includes(tile)) {
        if (count === 0) return false;
        if (count === 2) duplicateFound = true;
        if (count > 2) return false;
      } else if (count > 0) {
        return false;
      }
    }
    return duplicateFound;
  }

  function thirteenTiles() {
    return [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];
  }

  function meldToGroup(meld) {
    const tile = meld.tiles[0];
    if (meld.type === "chi") {
      const sorted = [...meld.tiles].sort((a, b) => a - b);
      return {
        kind: "seq",
        suit: tileSuit(sorted[0]),
        start: tileRank(sorted[0]),
        tiles: sorted,
        open: true,
        concealed: false
      };
    }
    return {
      kind: meld.type === "peng" ? "triplet" : "kong",
      tile,
      tiles: [...meld.tiles],
      open: meld.type !== "angang",
      concealed: meld.type === "angang"
    };
  }

  function isConcealedTriplet(group, winTile, ctx, pair) {
    if (group.kind !== "triplet" && group.kind !== "kong") return false;
    if (group.open) return false;
    if (group.kind === "kong") return true;
    if (ctx.selfDraw) return true;
    if (pair && pair.tile === winTile) return true;
    return group.tile !== winTile;
  }

  function isNineGates(counts) {
    for (let suit = 0; suit < 3; suit += 1) {
      const start = suit * 9;
      const slice = counts.slice(start, start + 9);
      const honors = counts.slice(27).some((count) => count > 0);
      const otherSuits = counts.some((count, tile) => count > 0 && isSuit(tile) && tileSuit(tile) !== suit);
      if (honors || otherSuits) continue;
      if (slice[0] >= 3 && slice[8] >= 3 && slice.slice(1, 8).every((count) => count >= 1)) {
        return true;
      }
    }
    return false;
  }

  function isPureDoubleDragon(seqs, pair) {
    if (!pair || !isSuit(pair.tile) || tileRank(pair.tile) !== 5) return false;
    const suit = tileSuit(pair.tile);
    return countSeq(seqs, suit, 1) === 2 && countSeq(seqs, suit, 7) === 2;
  }

  function isMixedDoubleDragon(seqs, pair) {
    if (!pair || !isSuit(pair.tile) || tileRank(pair.tile) !== 5) return false;
    const pairSuit = tileSuit(pair.tile);
    const otherSuits = [0, 1, 2].filter((suit) => suit !== pairSuit);
    return otherSuits.every((suit) => countSeq(seqs, suit, 1) >= 1 && countSeq(seqs, suit, 7) >= 1);
  }

  function hasSameSequenceCount(seqs, needed) {
    const map = new Map();
    seqs.forEach((seq) => {
      const key = `${seq.suit}-${seq.start}`;
      map.set(key, (map.get(key) || 0) + 1);
    });
    return [...map.values()].some((count) => count >= needed);
  }

  function hasFourStepChows(seqs) {
    for (let suit = 0; suit < 3; suit += 1) {
      const starts = seqs.filter((seq) => seq.suit === suit).map((seq) => seq.start);
      if (containsStarts(starts, [1, 2, 3, 4]) || containsStarts(starts, [2, 3, 4, 5]) ||
          containsStarts(starts, [3, 4, 5, 6]) || containsStarts(starts, [4, 5, 6, 7]) ||
          containsStarts(starts, [1, 3, 5, 7])) {
        return true;
      }
    }
    return false;
  }

  function hasThreeStepChowsSameSuit(seqs) {
    for (let suit = 0; suit < 3; suit += 1) {
      const starts = seqs.filter((seq) => seq.suit === suit).map((seq) => seq.start);
      for (let start = 1; start <= 5; start += 1) {
        if (containsStarts(starts, [start, start + 1, start + 2])) return true;
      }
      for (let start = 1; start <= 3; start += 1) {
        if (containsStarts(starts, [start, start + 2, start + 4])) return true;
      }
    }
    return false;
  }

  function hasThreeStepChowsMixed(seqs) {
    const bySuit = [0, 1, 2].map((suit) => seqs.filter((seq) => seq.suit === suit).map((seq) => seq.start));
    const permutations = [
      [0, 1, 2], [0, 2, 1], [1, 0, 2],
      [1, 2, 0], [2, 0, 1], [2, 1, 0]
    ];
    for (const order of permutations) {
      for (let start = 1; start <= 5; start += 1) {
        if (bySuit[order[0]].includes(start) && bySuit[order[1]].includes(start + 1) && bySuit[order[2]].includes(start + 2)) return true;
      }
      for (let start = 1; start <= 3; start += 1) {
        if (bySuit[order[0]].includes(start) && bySuit[order[1]].includes(start + 2) && bySuit[order[2]].includes(start + 4)) return true;
      }
    }
    return false;
  }

  function hasFlowerDragon(seqs) {
    const permutations = [
      [0, 1, 2], [0, 2, 1], [1, 0, 2],
      [1, 2, 0], [2, 0, 1], [2, 1, 0]
    ];
    return permutations.some(([a, b, c]) => countSeq(seqs, a, 1) && countSeq(seqs, b, 4) && countSeq(seqs, c, 7));
  }

  function hasMixedSameChows(seqs) {
    for (let start = 1; start <= 7; start += 1) {
      if ([0, 1, 2].every((suit) => countSeq(seqs, suit, start) > 0)) return true;
    }
    return false;
  }

  function countSameSequencePairs(seqs) {
    const map = new Map();
    seqs.forEach((seq) => {
      const key = `${seq.suit}-${seq.start}`;
      map.set(key, (map.get(key) || 0) + 1);
    });
    return [...map.values()].reduce((sum, count) => sum + Math.floor(count / 2), 0);
  }

  function countCrossSuitSequencePairs(seqs) {
    let total = 0;
    for (let start = 1; start <= 7; start += 1) {
      const suits = [0, 1, 2].filter((suit) => countSeq(seqs, suit, start) > 0).length;
      if (suits >= 2) total += suits === 3 ? 3 : 1;
    }
    return total;
  }

  function countLinkedSix(seqs) {
    let total = 0;
    for (let suit = 0; suit < 3; suit += 1) {
      for (let start = 1; start <= 4; start += 1) {
        if (countSeq(seqs, suit, start) > 0 && countSeq(seqs, suit, start + 3) > 0) total += 1;
      }
    }
    return total;
  }

  function countTerminalChowPairs(seqs) {
    let total = 0;
    for (let suit = 0; suit < 3; suit += 1) {
      total += Math.min(countSeq(seqs, suit, 1), countSeq(seqs, suit, 7));
    }
    return total;
  }

  function hasPureStraight(seqs) {
    return [0, 1, 2].some((suit) => countSeq(seqs, suit, 1) && countSeq(seqs, suit, 4) && countSeq(seqs, suit, 7));
  }

  function hasConsecutiveTriplets(triplets, length, sameSuit) {
    for (let suit = 0; suit < 3; suit += 1) {
      const ranks = triplets.filter((group) => isSuit(group.tile) && (!sameSuit || tileSuit(group.tile) === suit)).map((group) => tileRank(group.tile));
      for (let start = 1; start <= 10 - length; start += 1) {
        const needed = Array.from({ length }, (_, index) => start + index);
        if (needed.every((rank) => ranks.includes(rank))) return true;
      }
    }
    return false;
  }

  function hasSameRankTriplets(triplets, needed) {
    for (let rank = 1; rank <= 9; rank += 1) {
      const suits = new Set(triplets.filter((group) => isSuit(group.tile) && tileRank(group.tile) === rank).map((group) => tileSuit(group.tile)));
      if (suits.size >= needed) return true;
    }
    return false;
  }

  function countSameRankTripletPairs(triplets) {
    let count = 0;
    for (let rank = 1; rank <= 9; rank += 1) {
      const suits = new Set(triplets.filter((group) => isSuit(group.tile) && tileRank(group.tile) === rank).map((group) => tileSuit(group.tile)));
      if (suits.size >= 2) count += suits.size === 3 ? 3 : 1;
    }
    return count;
  }

  function hasMixedShiftedTriplets(triplets) {
    const bySuit = [0, 1, 2].map((suit) => triplets.filter((group) => isSuit(group.tile) && tileSuit(group.tile) === suit).map((group) => tileRank(group.tile)));
    const permutations = [
      [0, 1, 2], [0, 2, 1], [1, 0, 2],
      [1, 2, 0], [2, 0, 1], [2, 1, 0]
    ];
    return permutations.some((order) => {
      for (let start = 1; start <= 7; start += 1) {
        if (bySuit[order[0]].includes(start) && bySuit[order[1]].includes(start + 1) && bySuit[order[2]].includes(start + 2)) return true;
      }
      return false;
    });
  }

  function isAllEvenPungs(groups, pair) {
    if (!pair || !isSuit(pair.tile) || tileRank(pair.tile) % 2 !== 0) return false;
    return groups.every((group) => {
      if (group.kind === "seq") return false;
      return isSuit(group.tile) && tileRank(group.tile) % 2 === 0;
    });
  }

  function groupContainsFive(group) {
    return group.tiles.some((tile) => isSuit(tile) && tileRank(tile) === 5);
  }

  function groupContainsTerminalOrHonor(group) {
    return group.tiles.some(isTerminalOrHonor);
  }

  function groupsAndPairEvery(groups, pair, groupPredicate, pairPredicate) {
    return pair && groups.every(groupPredicate) && pairPredicate(pair.tile);
  }

  function hasFiveGates(tiles) {
    return [0, 1, 2].every((suit) => tiles.some((tile) => isSuit(tile) && tileSuit(tile) === suit)) &&
      tiles.some(isWind) &&
      tiles.some(isDragon);
  }

  function countSeq(seqs, suit, start) {
    return seqs.filter((seq) => seq.suit === suit && seq.start === start).length;
  }

  function containsStarts(starts, needed) {
    const copy = [...starts];
    return needed.every((value) => {
      const index = copy.indexOf(value);
      if (index === -1) return false;
      copy.splice(index, 1);
      return true;
    });
  }

  function cloneGroup(group) {
    return { ...group, tiles: [...group.tiles] };
  }

  function countsFromTiles(tiles) {
    const counts = Array(34).fill(0);
    tiles.forEach((tile) => {
      counts[tile] += 1;
    });
    return counts;
  }

  function visibleCounts() {
    return countsFromTiles(state.concealed.map((item) => item.tile));
  }

  function concealedTileIds() {
    return state.concealed.filter((item) => !item.meldId).map((item) => item.tile);
  }

  function physicalTileCount() {
    return state.concealed.length;
  }

  function effectiveTileCount() {
    return concealedTileIds().length + state.melds.length * 3;
  }

  function uniqueTiles(tiles) {
    return [...new Set(tiles)].sort((a, b) => a - b);
  }

  function isSequenceTiles(tiles) {
    return tiles.length === 3 &&
      tiles.every(isSuit) &&
      tileSuit(tiles[0]) === tileSuit(tiles[1]) &&
      tileSuit(tiles[1]) === tileSuit(tiles[2]) &&
      tiles[1] === tiles[0] + 1 &&
      tiles[2] === tiles[1] + 1;
  }

  function allSame(tiles) {
    return tiles.length > 0 && tiles.every((tile) => tile === tiles[0]);
  }

  function tileSuit(tile) {
    if (tile < 9) return 0;
    if (tile < 18) return 1;
    if (tile < 27) return 2;
    return tile < 31 ? 3 : 4;
  }

  function tileRank(tile) {
    if (tile < 27) return (tile % 9) + 1;
    if (tile < 31) return tile - 26;
    return tile - 30;
  }

  function isSuit(tile) {
    return tile >= 0 && tile < 27;
  }

  function isHonor(tile) {
    return tile >= 27;
  }

  function isWind(tile) {
    return tile >= 27 && tile <= 30;
  }

  function isDragon(tile) {
    return tile >= 31 && tile <= 33;
  }

  function isTerminal(tile) {
    return isSuit(tile) && (tileRank(tile) === 1 || tileRank(tile) === 9);
  }

  function isTerminalOrHonor(tile) {
    return isHonor(tile) || isTerminal(tile);
  }

  function isSimple(tile) {
    return isSuit(tile) && tileRank(tile) >= 2 && tileRank(tile) <= 8;
  }

  function isGreenTile(tile) {
    return [19, 20, 21, 23, 25, 32].includes(tile);
  }

  function isReversibleTile(tile) {
    return [9, 10, 11, 12, 13, 16, 17, 19, 21, 22, 23, 25, 26, 33].includes(tile);
  }

  function noOpenMelds(melds) {
    return melds.every((meld) => meld.type === "angang");
  }

  function clamp(value, min, max) {
    if (Number.isNaN(value)) return min;
    return Math.max(min, Math.min(max, value));
  }

  if (typeof window !== "undefined" && typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", init);
  }

  if (typeof module !== "undefined") {
    module.exports = {
      TILE_DEFS,
      countsFromTiles,
      enumerateWins,
      evaluateHand,
      tileSuit,
      tileRank,
      isSevenPairs,
      isThirteenOrphans
    };
  }
}());
