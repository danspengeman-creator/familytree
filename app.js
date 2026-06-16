(function () {
  "use strict";

  const PEOPLE = FAMILY_DATA.people;
  const FAMILIES = FAMILY_DATA.families;
  const ROOT_ID = FAMILY_DATA.rootId;

  // ---------- formatting helpers ----------

  function person(id) { return id ? PEOPLE[id] : null; }

  function fullName(p) {
    if (!p) return "Unknown";
    return [p.given, p.birthSurname].filter(Boolean).join(" ");
  }

  function lifespan(p) {
    if (!p.birthDate && !p.deathDate) return "dates unknown";
    const b = p.birthDate ? shortDate(p.birthDate) : "?";
    if (!p.deathDate) return "b. " + b;
    return b + "\u2013" + shortDate(p.deathDate);
  }

  function shortDate(d) {
    if (!d) return "?";
    return d.replace(/^abt\.?\s*/i, "c. ").replace(/^about\s*/i, "c. ");
  }

  function yearOf(d) {
    if (!d) return null;
    const m = d.match(/(1[5-9]\d{2}|20\d{2})/);
    return m ? parseInt(m[1], 10) : null;
  }

  function placeShort(place) {
    if (!place) return "";
    const parts = place.split(",").map(s => s.trim());
    if (parts.length <= 2) return place;
    return parts[0] + ", " + parts[parts.length - 2];
  }

  function hasNote(p) { return !!p.note; }
  function hasUncertainSpouse(p) {
    return p.spouses && p.spouses.some(s => s.uncertain);
  }

  const RELATION_SIDE = { f: "paternal", m: "maternal" };
  function relationLabel(path) {
    if (path.length === 0) return "";
    if (path.length === 1) return path[0] === "f" ? "father" : "mother";
    const side = RELATION_SIDE[path[0]];
    const last = path[path.length - 1];
    const greats = path.length - 2;
    let prefix = "grand";
    if (greats > 0) prefix = "great-".repeat(greats) + "grand";
    const noun = last === "f" ? prefix + "father" : prefix + "mother";
    return side + " " + noun;
  }

  // ---------- general relationship-to-Daniel calculator (covers the whole directory) ----------

  function ancestorDistances(startId) {
    const dist = {};
    const queue = [[startId, 0]];
    while (queue.length) {
      const [id, d] = queue.shift();
      if (dist[id] !== undefined && dist[id] <= d) continue;
      dist[id] = d;
      const p = person(id);
      if (!p) continue;
      if (p.father) queue.push([p.father, d + 1]);
      if (p.mother) queue.push([p.mother, d + 1]);
    }
    return dist;
  }

  function findPathDown(fromId, toId) {
    if (fromId === toId) return [];
    const p = person(fromId);
    if (!p) return null;
    if (p.father) {
      const r = findPathDown(p.father, toId);
      if (r) return ["f"].concat(r);
    }
    if (p.mother) {
      const r = findPathDown(p.mother, toId);
      if (r) return ["m"].concat(r);
    }
    return null;
  }

  function ordinal(n) {
    const s = ["th", "st", "nd", "rd"], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  const DANIEL_ANCESTORS = ancestorDistances(ROOT_ID);

  function bloodRelationToDaniel(targetId) {
    if (targetId === ROOT_ID) return "Daniel";
    const targetDist = ancestorDistances(targetId);
    let best = null;
    Object.keys(DANIEL_ANCESTORS).forEach(ancId => {
      if (targetDist[ancId] !== undefined) {
        const A = DANIEL_ANCESTORS[ancId], B = targetDist[ancId];
        if (!best || (A + B) < (best.A + best.B)) best = { ancId, A, B };
      }
    });
    if (!best) return null;
    const { A, B } = best;
    const tp = person(targetId);

    if (B === 0) {
      const path = findPathDown(ROOT_ID, targetId);
      return "Daniel's " + relationLabel(path || []);
    }
    if (A === 0) return null; // Daniel has no descendants in this tree yet

    if (A === 1 && B === 1) {
      const dp = person(ROOT_ID);
      const full = dp.father && dp.father === tp.father && dp.mother && dp.mother === tp.mother;
      const word = tp.sex === "M" ? "brother" : tp.sex === "F" ? "sister" : "sibling";
      return "Daniel's " + (full ? word : "half-" + word);
    }

    const m = Math.min(A, B), n = Math.max(A, B);
    if (m === 1) {
      const level = n - 2;
      const greatPrefix = level > 0 ? "great-".repeat(level) : "";
      if (A < B) {
        const word = tp.sex === "M" ? "nephew" : tp.sex === "F" ? "niece" : "nephew/niece";
        return "Daniel's " + greatPrefix + word;
      }
      const word = tp.sex === "M" ? "uncle" : tp.sex === "F" ? "aunt" : "aunt/uncle";
      return "Daniel's " + greatPrefix + word;
    }

    const degree = m - 1, removed = n - m;
    let label = ordinal(degree) + " cousin";
    if (removed > 0) label += ", " + ordinal(removed) + " removed";
    return "Daniel's " + label;
  }

  function siblingsOf(id) {
    const p = person(id);
    if (!p) return [];
    const out = new Set();
    [p.father, p.mother].forEach(parentId => {
      const parent = person(parentId);
      if (parent) (parent.children || []).forEach(cid => { if (cid !== id) out.add(cid); });
    });
    return Array.from(out);
  }

  function reverseHopWord(hopType, earlierPerson) {
    const sex = earlierPerson ? earlierPerson.sex : null;
    if (hopType === "spouse") return sex === "F" ? "wife" : sex === "M" ? "husband" : "spouse";
    if (hopType === "child") return sex === "F" ? "mother" : sex === "M" ? "father" : "parent";
    if (hopType === "parent") return sex === "F" ? "daughter" : sex === "M" ? "son" : "child";
    if (hopType === "sibling") return sex === "F" ? "sister" : sex === "M" ? "brother" : "sibling";
    return "relative";
  }

  function relationshipToDaniel(targetId) {
    const direct = bloodRelationToDaniel(targetId);
    if (direct) return direct;

    // BFS through spouse / parent / child / sibling edges to the nearest blood-connected relative
    const visited = new Set([targetId]);
    const queue = [[targetId, []]];
    while (queue.length) {
      const [curId, path] = queue.shift();
      const p = person(curId);
      if (!p) continue;
      const neighbors = [];
      (p.spouses || []).forEach(s => neighbors.push({ type: "spouse", id: s.spouseId }));
      (p.children || []).forEach(cid => neighbors.push({ type: "child", id: cid }));
      if (p.father) neighbors.push({ type: "parent", id: p.father });
      if (p.mother) neighbors.push({ type: "parent", id: p.mother });
      siblingsOf(curId).forEach(sid => neighbors.push({ type: "sibling", id: sid }));

      for (const nb of neighbors) {
        if (visited.has(nb.id) || !person(nb.id)) continue;
        visited.add(nb.id);
        const newPath = path.concat([{ type: nb.type, fromId: curId, toId: nb.id }]);
        const rel = bloodRelationToDaniel(nb.id);
        if (rel) {
          let result = rel;
          for (let i = newPath.length - 1; i >= 0; i--) {
            const hop = newPath[i];
            const earlier = person(hop.fromId);
            result += "'s " + reverseHopWord(hop.type, earlier);
          }
          return result;
        }
        queue.push([nb.id, newPath]);
      }
    }
    return "Related by marriage";
  }

  // ---------- TREE VIEW ----------

  const treeRoot = document.getElementById("tree-root");

  const GEN_COLORS = ["#c08a3e", "#b97a7a", "#8f87b0", "#c2935f", "#9aab7a", "#9c8f6a"];

  function genColor(depth) {
    return GEN_COLORS[depth % GEN_COLORS.length];
  }

  function findMarriage(fatherId, motherId) {
    const f = person(fatherId);
    if (!f || !f.spouses) return null;
    return f.spouses.find(s => s.spouseId === motherId) || null;
  }

  function buildBox(id, path) {
    const p = person(id);
    const wrap = document.createElement("div");
    wrap.className = "pbox-wrap";

    const box = document.createElement("div");
    box.className = "pbox";
    box.style.setProperty("--gen-color", genColor(path.length));

    const flags = document.createElement("div");
    flags.className = "flags";
    if (p && hasNote(p)) {
      const f = document.createElement("span");
      f.className = "flag flag-note";
      f.title = "Has a research note";
      flags.appendChild(f);
    }
    if (p && hasUncertainSpouse(p)) {
      const f = document.createElement("span");
      f.className = "flag flag-uncertain";
      f.title = "A date here is uncertain";
      flags.appendChild(f);
    }
    box.appendChild(flags);

    const name = document.createElement("span");
    name.className = "person-name";
    name.textContent = fullName(p);
    if (p && p.suffix) {
      const suf = document.createElement("span");
      suf.className = "suffix";
      suf.textContent = p.suffix;
      name.appendChild(suf);
    }
    box.appendChild(name);

    if (p) {
      const meta = document.createElement("span");
      meta.className = "person-meta";
      meta.textContent = lifespan(p);
      box.appendChild(meta);
    }

    const genTag = document.createElement("span");
    genTag.className = "gen-tag";
    genTag.textContent = path.length === 0 ? "this is daniel" : relationLabel(path);
    box.appendChild(genTag);

    box.addEventListener("click", () => openDetail(id));
    wrap.appendChild(box);
    return wrap;
  }

  function buildTreeNode(id, path) {
    const p = person(id);
    const node = document.createElement("div");
    node.className = "tree-node pnode";

    const hasParents = !!(p && (p.father || p.mother));
    node.dataset.open = (hasParents && path.length < 2) ? "true" : "false";

    const boxWrap = buildBox(id, path);

    if (hasParents) {
      const toggle = document.createElement("button");
      toggle.className = "ptoggle";
      toggle.setAttribute("aria-label", "Expand or collapse ancestors");
      toggle.textContent = node.dataset.open === "true" ? "\u2212" : "+";
      toggle.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleNode(node);
      });
      boxWrap.appendChild(toggle);
    }

    node.appendChild(boxWrap);

    if (hasParents) {
      const childWrap = document.createElement("div");
      childWrap.className = "pchildren";
      childWrap.dataset.collapsed = node.dataset.open === "true" ? "false" : "true";

      if (p.father) {
        const fatherSlot = document.createElement("div");
        fatherSlot.className = "pchild";
        fatherSlot.appendChild(buildTreeNode(p.father, path.concat("f")));
        childWrap.appendChild(fatherSlot);
      }
      if (p.mother) {
        const motherSlot = document.createElement("div");
        motherSlot.className = "pchild";
        motherSlot.appendChild(buildTreeNode(p.mother, path.concat("m")));
        childWrap.appendChild(motherSlot);
      }

      if (p.father && p.mother) {
        const marr = findMarriage(p.father, p.mother);
        if (marr && (marr.marriageDate || marr.marriagePlace)) {
          const badge = document.createElement("span");
          badge.className = "pmarriage";
          let txt = "m. " + (marr.marriageDate ? shortDate(marr.marriageDate) : "?");
          if (marr.uncertain) txt += " (uncertain)";
          badge.textContent = txt;
          badge.title = marr.marriagePlace || "";
          childWrap.appendChild(badge);
        }
      }

      node.appendChild(childWrap);
    }

    return node;
  }

  function toggleNode(node, forceOpen) {
    const willOpen = forceOpen !== undefined ? forceOpen : node.dataset.open !== "true";
    node.dataset.open = willOpen ? "true" : "false";
    const kids = node.querySelector(":scope > .pchildren");
    if (kids) kids.dataset.collapsed = willOpen ? "false" : "true";
    const btn = node.querySelector(":scope > .pbox-wrap > .ptoggle");
    if (btn) btn.textContent = willOpen ? "\u2212" : "+";
  }

  function renderTree() {
    treeRoot.innerHTML = "";
    treeRoot.appendChild(buildTreeNode(ROOT_ID, []));
  }

  document.getElementById("expand-all").addEventListener("click", () => {
    treeRoot.querySelectorAll(".tree-node").forEach(n => toggleNode(n, true));
  });
  document.getElementById("collapse-all").addEventListener("click", () => {
    treeRoot.querySelectorAll(".tree-node").forEach((n, i) => toggleNode(n, i === 0));
  });

  // ---------- DIRECTORY VIEW ----------

  const BRANCH_GROUPS = [
    { title: "Spengeman", surnames: ["spengeman"] },
    { title: "Crawford & Duncan", surnames: ["crawford", "duncan", "emmons", "hulse", "freeman"] },
    { title: "McLaughlin & Hartnedy", surnames: ["mclaughlin", "hartnedy"] },
    { title: "Packet & Michaluk", surnames: ["packet", "michaluk"] },
    { title: "McNutt, Ford, Dierking & Reagan", surnames: ["mcnutt", "ford", "dierking", "reagan", "ragan", "prouse", "hammond"] },
    { title: "Skeen, Howard, Boyd & Barnes", surnames: ["skeen", "howard", "boyd", "barnes"] },
    { title: "Mullins", surnames: ["mullins"] },
  ];

  function branchFor(p) {
    const s = (p.birthSurname || "").toLowerCase();
    for (const g of BRANCH_GROUPS) {
      if (g.surnames.includes(s)) return g.title;
    }
    return "Other";
  }

  function buildDirectory() {
    const groups = {};
    Object.keys(PEOPLE).forEach(id => {
      const p = PEOPLE[id];
      const b = branchFor(p);
      if (!groups[b]) groups[b] = [];
      groups[b].push(id);
    });
    Object.keys(groups).forEach(b => {
      groups[b].sort((a, c) => {
        const ya = yearOf(PEOPLE[a].birthDate) || 9999;
        const yc = yearOf(PEOPLE[c].birthDate) || 9999;
        return ya - yc;
      });
    });
    return groups;
  }

  const directoryRoot = document.getElementById("directory-root");
  const DIRECTORY = buildDirectory();
  const ORDER = BRANCH_GROUPS.map(g => g.title).concat(["Other"]);

  function renderDirectory(filterText) {
    directoryRoot.innerHTML = "";
    const q = (filterText || "").trim().toLowerCase();
    let anyMatch = false;

    ORDER.forEach(title => {
      const ids = DIRECTORY[title];
      if (!ids || !ids.length) return;
      const filtered = q
        ? ids.filter(id => fullName(PEOPLE[id]).toLowerCase().includes(q))
        : ids;
      if (!filtered.length) return;
      anyMatch = true;

      const branchEl = document.createElement("div");
      branchEl.className = "branch";
      const h = document.createElement("h2");
      h.className = "branch-title";
      h.textContent = title;
      branchEl.appendChild(h);

      const list = document.createElement("div");
      list.className = "branch-list";
      filtered.forEach(id => {
        const p = PEOPLE[id];
        const row = document.createElement("div");
        row.className = "directory-row";
        const top = document.createElement("div");
        top.className = "directory-row-top";
        const name = document.createElement("span");
        name.className = "person-name";
        name.textContent = fullName(p) + (p.suffix ? " " + p.suffix : "");
        const meta = document.createElement("span");
        meta.className = "person-meta";
        meta.textContent = lifespan(p);
        top.appendChild(name);
        top.appendChild(meta);
        if (hasNote(p)) {
          const f = document.createElement("span");
          f.className = "flag flag-note";
          top.appendChild(f);
        }
        row.appendChild(top);

        const rel = document.createElement("span");
        rel.className = "relation-badge" + (id === ROOT_ID ? " relation-badge-self" : "");
        rel.textContent = id === ROOT_ID ? "This is Daniel" : relationshipToDaniel(id);
        row.appendChild(rel);

        row.addEventListener("click", () => openDetail(id));
        list.appendChild(row);
      });
      branchEl.appendChild(list);
      directoryRoot.appendChild(branchEl);
    });

    if (!anyMatch) {
      const empty = document.createElement("p");
      empty.className = "directory-empty";
      empty.textContent = "No one in the tree matches \u201c" + filterText + "\u201d.";
      directoryRoot.appendChild(empty);
    }
  }

  document.getElementById("search-input").addEventListener("input", (e) => {
    renderDirectory(e.target.value);
  });

  // ---------- DETAIL PANEL ----------

  const detailPanel = document.getElementById("detail-panel");
  const detailContent = document.getElementById("detail-content");

  function spouseLine(s) {
    const sp = person(s.spouseId);
    let line = sp ? fullName(sp) : "Unknown";
    if (s.marriageDate) line += " \u2014 m. " + shortDate(s.marriageDate);
    if (s.marriagePlace) line += ", " + placeShort(s.marriagePlace);
    return line;
  }

  function openDetail(id) {
    const p = person(id);
    if (!p) return;

    let html = "";
    html += `<h2 id="detail-name">${fullName(p)}${p.suffix ? ' <span class="suffix">' + p.suffix + "</span>" : ""}</h2>`;
    html += `<p class="detail-lifespan">${lifespan(p)}</p>`;

    html += `<dl class="detail-grid">`;
    html += `<dt>Born</dt><dd>${p.birthDate || "unknown"}${p.birthPlace ? " &middot; " + p.birthPlace : ""}</dd>`;
    html += `<dt>Died</dt><dd>${p.deathDate || (p.deathDate === null ? "unknown" : "&mdash;")}${p.deathPlace ? " &middot; " + p.deathPlace : ""}</dd>`;
    if (p.father || p.mother) {
      html += `<dt>Parents</dt><dd>`;
      const parts = [];
      if (p.father) parts.push(fullName(person(p.father)));
      if (p.mother) parts.push(fullName(person(p.mother)));
      html += parts.join(" &amp; ");
      html += `</dd>`;
    }
    html += `</dl>`;

    if (p.spouses && p.spouses.length) {
      html += `<div class="detail-section-title">${p.spouses.length > 1 ? "Marriages" : "Marriage"}</div>`;
      html += `<div class="detail-link-list">`;
      p.spouses.forEach(s => {
        const sp = person(s.spouseId);
        const btn = sp ? `data-goto="${s.spouseId}"` : "";
        html += `<button class="detail-link" ${btn}>${spouseLine(s)}${s.uncertain ? '<span class="stamp uncertain">date uncertain</span>' : ""}</button>`;
      });
      html += `</div>`;
    }

    if (p.children && p.children.length) {
      const kids = [...new Set(p.children)].filter(c => PEOPLE[c]);
      if (kids.length) {
        html += `<div class="detail-section-title">Children</div>`;
        html += `<div class="detail-link-list">`;
        kids.forEach(cid => {
          html += `<button class="detail-link" data-goto="${cid}">${fullName(person(cid))}</button>`;
        });
        html += `</div>`;
      }
    }

    if (p.note) {
      html += `<div class="detail-section-title">Research note</div>`;
      html += `<div class="detail-note">${p.note}</div>`;
    }

    detailContent.innerHTML = html;
    detailContent.querySelectorAll("[data-goto]").forEach(btn => {
      btn.addEventListener("click", () => openDetail(btn.dataset.goto));
    });

    detailPanel.setAttribute("aria-hidden", "false");
  }

  function closeDetail() {
    detailPanel.setAttribute("aria-hidden", "true");
  }

  detailPanel.querySelector(".detail-close").addEventListener("click", closeDetail);
  detailPanel.querySelector(".detail-backdrop").addEventListener("click", closeDetail);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeDetail();
  });

  // ---------- NOTES VIEW ----------

  function renderNotes() {
    const root = document.getElementById("notes-root");
    root.innerHTML = `
      <h2>How this tree was built</h2>
      <p>This site started from a GEDCOM file exported from an Ancestry.com research tree, alongside a hand-drawn pedigree chart with family notes written in the margins. The two didn't always agree. Where they conflicted, a decision was made about which version to keep, and that decision is recorded here rather than quietly papered over.</p>

      <h2>Decisions made</h2>

      <div class="note-item">
        <strong>William D. Spengeman, Sr. and Jr.</strong>
        <p>The original chart combined grandfather and father into a single box. The records clearly separate them: William Daniel "Bud" Spengeman, Sr. (1915&ndash;1999) married Lillian Bertha Crawford and is Daniel's grandfather. His son, William D. Spengeman, Jr. (b. 1945), married Susan Patricia Packet and is Daniel's father. They are shown as two people throughout this tree.</p>
      </div>

      <div class="note-item">
        <strong>Lillian Bertha Crawford Spengeman's death date</strong>
        <p>The Social Security Death Index records August 15, 1994; a separate Ancestry tree estimate records August 12, 1994. This site uses the SSDI date.</p>
      </div>

      <div class="note-item">
        <strong>The two Holmes Crawfords</strong>
        <p>The source tree contained two entries for Holmes Cleveland Crawford with two different sets of parents. One set, Franklin Everett Crawford and Alvira Emmons, is kept here. The other, a "Charles Frederick Duncan" and "Alvira Crawford," was dropped: that Charles Frederick Duncan and the real Franklin Everett Crawford share an identical recorded death date and place, which is a strong sign of a duplicated record rather than two different men.</p>
      </div>

      <div class="note-item is-uncertain">
        <strong>William Riley Ford's dates</strong>
        <p>Census and death records disagree slightly: birth as either 1846 or 1847, death as either February 14 or 15, 1922. This site uses February 22, 1846 and February 14, 1922.</p>
      </div>

      <div class="note-item is-uncertain">
        <strong>Two uncertain marriage dates</strong>
        <p>William Henry Freeman and Mabel Duncan's marriage is recorded as either April 6, 1913 or October 30, 1917. Anderson McNutt and Emma Louise Dierking's marriage is recorded as either 1877 or December 17, 1885. Both are marked uncertain in the tree, with both candidate dates kept on record.</p>
      </div>

      <div class="note-item">
        <strong>Anna Michaluk, not "Mehawik"</strong>
        <p>Six independent records, a Hamburg passenger list, two U.S. censuses, a marriage index, a naturalization petition and a Social Security record, all agree on the surname Michaluk. The spelling "Mehawik" appears to be how the family remembered or pronounced it, not how it was recorded.</p>
      </div>

      <div class="note-item">
        <strong>Sandra's children</strong>
        <p>Jeremy, Justin, Susan Eliza and Sara Marie were all born with the surname Spengeman, children of Sandra and Donald Franklin Spengeman. The source file never actually linked Donald as their father; that link has been added here. Sara Marie later became Sara Marie Barnes when she married Edward Barnes &mdash; the other three kept the Spengeman name.</p>
      </div>

      <h2>What's still open</h2>
      <p>Polly Ann Hammond, Berthena Ford's daughter, has no father recorded anywhere in the source material. That branch is included as-is and could use more research. William G. and Maria S. Crawford are recorded as the parents of Charles Frederick Duncan, despite the surname mismatch; this is kept as documented since no better explanation turned up, but it's worth a second look if anyone has family knowledge here.</p>
    `;
  }

  // ---------- TABS ----------

  document.querySelectorAll(".tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach(t => t.setAttribute("aria-selected", "false"));
      tab.setAttribute("aria-selected", "true");
      document.querySelectorAll(".view").forEach(v => v.dataset.active = "false");
      document.getElementById("view-" + tab.dataset.view).dataset.active = "true";
    });
  });

  // ---------- INIT ----------

  renderTree();
  renderDirectory("");
  renderNotes();
})();
