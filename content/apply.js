// HireTrackr — apply.js
// Injected into a page (every frame) only when the user presses "Autofill page"
// or "Attach", or starts dragging a CV out of the side panel. It never runs on
// its own, and it does nothing until the side panel calls one of the functions
// exposed on globalThis.__hiretrackr (isolated world: the page can't see them).

(() => {
  'use strict';
  if (globalThis.__hiretrackr) return;

  // ── Finding things on the page ───────────────────────────────────

  function shadowOf(el) {
    try {
      return chrome.dom?.openOrClosedShadowRoot?.(el) || el.shadowRoot || null;
    } catch (e) {
      return el.shadowRoot || null;
    }
  }

  // querySelectorAll that also looks inside shadow roots
  function deepQueryAll(root, selector, out = []) {
    out.push(...root.querySelectorAll(selector));
    for (const el of root.querySelectorAll('*')) {
      const shadow = shadowOf(el);
      if (shadow) deepQueryAll(shadow, selector, out);
    }
    return out;
  }

  function isVisible(el) {
    return el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  }

  // First ancestor (or the element itself) that takes up space on screen.
  // File inputs are usually hidden behind a styled button or drop zone.
  function visibleBox(el) {
    for (let node = el; node; node = node.parentElement) {
      const r = node.getBoundingClientRect();
      if (r.width > 4 && r.height > 4) return node;
    }
    return el;
  }

  function normalize(text) {
    return String(text || '')
      .replace(/([a-z])([A-Z])/g, '$1 $2')   // firstName -> first Name
      .replace(/[_\-.:\[\]\/*()]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  // Everything that tells us what a field is for: its attributes and its label.
  function describe(el) {
    const parts = [
      el.name, el.id, el.placeholder,
      el.getAttribute('aria-label'),
      el.getAttribute('data-automation-id'),
      el.getAttribute('data-testid'),
      el.getAttribute('data-qa'),
    ];
    for (const label of el.labels || []) parts.push(label.textContent);

    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      const root = el.getRootNode();
      for (const id of labelledBy.split(/\s+/)) parts.push(root.getElementById?.(id)?.textContent);
    }

    // No proper label: use the text of the closest small wrapper around the field
    if (!(el.labels && el.labels.length) && !labelledBy && !el.getAttribute('aria-label')) {
      for (let node = el.parentElement, depth = 0; node && depth < 3; node = node.parentElement, depth++) {
        const text = node.textContent.trim();
        if (text) { if (text.length <= 80) parts.push(text); break; }
      }
    }
    return normalize(parts.filter(Boolean).join(' ')).slice(0, 300);
  }

  let flashTimer = null;
  const flashed = new Map();   // element -> its previous inline outline

  function flash(elements) {
    for (const el of elements) {
      if (!flashed.has(el)) flashed.set(el, [el.style.outline, el.style.outlineOffset]);
      el.style.outline = '2px solid #2e9e6b';
      el.style.outlineOffset = '2px';
    }
    clearTimeout(flashTimer);
    flashTimer = setTimeout(clearFlash, 1600);
  }

  function clearFlash() {
    for (const [el, [outline, offset]] of flashed) {
      el.style.outline = outline;
      el.style.outlineOffset = offset;
    }
    flashed.clear();
  }

  // ── Autofill ─────────────────────────────────────────────────────

  // Standard autocomplete tokens are the most reliable signal when a site sets them
  const AUTOCOMPLETE = {
    'given-name': 'firstName', 'family-name': 'lastName', 'name': 'fullName',
    'email': 'email', 'tel': 'phone', 'tel-national': 'phone',
    'address-level2': 'city', 'country-name': 'country', 'country': 'country', 'url': 'website',
  };

  // Checked top to bottom against the field's description; first match wins.
  // English, French, Spanish, German and Arabic labels.
  const RULES = [
    ['linkedin',  /linked ?in/],
    ['github',    /git ?hub/],
    ['email',     /e ?mail|courriel|correo|البريد/],
    ['phone',     /phone|mobile|\btel\b|téléphone|telefon|portable|celular|móvil|الهاتف|الجوال/],
    ['fullName',  /full ?name|nom complet|nombre completo|vollständiger name|الاسم الكامل/],
    ['firstName', /first ?name|given ?name|\bfname\b|forename|prénom|prenom|vorname|\bnombre\b|الاسم الأول/],
    ['lastName',  /last ?name|family ?name|surname|\blname\b|nom de famille|\bnom\b|nachname|apellido|اسم العائلة|الاسم الأخير/],
    ['fullName',  /\bname\b|الاسم/],
    ['website',   /portfolio|web ?site|site web|personal (site|url)|\burl\b|homepage/],
    ['city',      /\bcity\b|\bville\b|ciudad|\bstadt\b|\btown\b|\blocation\b|localisation|المدينة/],
    ['country',   /country|\bpays\b|país|\bland\b|البلد|الدولة/],
  ];

  // Fields that look like ours but are about something or someone else
  const NOT_ABOUT_YOU = /company|employer|organi[sz]ation|school|universit|college|referr|reference|emergency|recruiter|manager|user ?name|utilisateur|usuario|benutzer|login|password|search|captcha|coupon|promo|salary|cover|file ?name/;

  function profileKeyFor(el) {
    const token = (el.getAttribute('autocomplete') || '').toLowerCase().split(/\s+/).pop();
    if (AUTOCOMPLETE[token]) return AUTOCOMPLETE[token];

    const text = describe(el);
    if (NOT_ABOUT_YOU.test(text)) return null;
    if (el.type === 'email') return 'email';
    if (el.type === 'tel') return 'phone';
    for (const [key, pattern] of RULES) {
      if (pattern.test(text)) return key;
    }
    return null;
  }

  // Sets a value the way typing would, so React/Vue/Angular forms notice it.
  function setValue(el, value) {
    const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new FocusEvent('blur'));
    el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  }

  function fillSelect(select, value) {
    const wanted = value.trim().toLowerCase();
    const options = [...select.options];
    const option =
      options.find(o => o.text.trim().toLowerCase() === wanted || o.value.toLowerCase() === wanted) ||
      options.find(o => o.text.trim().toLowerCase().startsWith(wanted));
    if (!option) return false;
    setValue(select, option.value);
    return true;
  }

  // Fills the empty fields it recognises in this frame. Never overwrites what
  // the user already typed. Returns how many fields it filled.
  function fill(profile) {
    const values = {
      ...profile,
      fullName: [profile.firstName, profile.lastName].filter(Boolean).join(' '),
    };
    const textTypes = ['text', 'email', 'tel', 'url', 'search', ''];
    const fields = deepQueryAll(document, 'input, select').filter(el =>
      !el.disabled && !el.readOnly && isVisible(el) &&
      (el instanceof HTMLSelectElement
        ? el.selectedIndex <= 0
        : textTypes.includes((el.getAttribute('type') || '').toLowerCase()) && !el.value)
    );

    const filled = [];
    for (const el of fields) {
      const key = profileKeyFor(el);
      const value = key && values[key];
      if (!value) continue;
      if (el instanceof HTMLSelectElement) {
        if (key !== 'country' || !fillSelect(el, value)) continue;
      } else {
        setValue(el, value);
      }
      filled.push(el);
    }
    flash(filled);
    return filled.length;
  }

  // ── CV upload fields ─────────────────────────────────────────────

  const CV_WORDS     = /resume|résumé|\bcv\b|curriculum|lebenslauf|سيرة/;
  const NOT_CV_WORDS = /cover|motivation|lettre|photo|avatar|picture|image|logo|transcript|certificate|diplom/;

  // file: { name, type }
  function accepts(input, file) {
    const accept = (input.accept || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
    if (!accept.length) return true;
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    return accept.some(a =>
      a === ext || a === file.type || a === '*/*' ||
      (a.endsWith('/*') && file.type.startsWith(a.slice(0, -1)))
    );
  }

  // How likely this input is the "upload your CV" one. Zero or less = don't use it.
  function uploadScore(input, file) {
    if (input.disabled || !accepts(input, file)) return -1;
    let text = describe(input);
    for (let node = input.parentElement, depth = 0; node && depth < 3; node = node.parentElement, depth++) {
      const around = node.textContent.trim();
      if (around) { text += ' ' + normalize(around.slice(0, 200)); break; }
    }
    let score = 1;
    if (CV_WORDS.test(text)) score += 10;
    if (NOT_CV_WORDS.test(text)) score -= 5;
    return score;
  }

  function bestUpload(inputs, file) {
    let best = null, bestScore = 0;
    for (const input of inputs) {
      const score = uploadScore(input, file);
      if (score > bestScore) { best = input; bestScore = score; }
    }
    return { input: best, score: bestScore };
  }

  function toFile(data) {
    const bytes = Uint8Array.from(atob(data.b64), c => c.charCodeAt(0));
    return new File([bytes], data.name, { type: data.type });
  }

  function transferWith(file) {
    const dt = new DataTransfer();
    dt.items.add(file);
    return dt;
  }

  // Puts the file in the input exactly as if the user had picked it from disk.
  function setInputFile(input, file) {
    input.files = transferWith(file).files;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    const box = visibleBox(input);
    box.scrollIntoView({ block: 'center', behavior: 'smooth' });
    flash([box]);
  }

  // Best score in this frame, so the side panel can pick the right frame.
  function scanUpload(file) {
    return bestUpload(deepQueryAll(document, 'input[type="file"]'), file).score;
  }

  // "Attach" button: no drop point, so use the best upload field in this frame.
  function attach(data) {
    const { input } = bestUpload(deepQueryAll(document, 'input[type="file"]'), data);
    if (!input) return false;
    setInputFile(input, toFile(data));
    return true;
  }

  // ── Dropping a CV dragged from the side panel ────────────────────
  //
  // A drag that starts in the side panel can't carry the file itself into the
  // page. So the drag is only the gesture: the side panel tells us a CV drag
  // is under way, we accept the drop, then ask the side panel for the file and
  // hand it to the upload field ourselves.

  let dragging = false;
  let dragTimer = null;
  let hovered = null;                 // element currently outlined as the drop target
  let uploads = null;                 // the page's file inputs and the boxes that stand for them
  let uploadsAt = 0;

  function realTarget(e) {
    const el = e.composedPath()[0];
    return el instanceof Element ? el : e.target;
  }

  // Each file input with the on-screen boxes that stand for it: the styled
  // button or drop zone wrapped around it, and its labels. An input whose only
  // box is the whole page is left out — "anywhere" is not an upload area.
  function uploadBoxes() {
    if (uploads && Date.now() - uploadsAt < 400) return uploads;   // dragover fires constantly
    uploads = deepQueryAll(document, 'input[type="file"]')
      .filter(input => !input.disabled)
      .map(input => ({
        input,
        boxes: [visibleBox(input), ...(input.labels || [])]
          .filter(box => box !== document.body && box !== document.documentElement),
      }));
    uploadsAt = Date.now();
    return uploads;
  }

  // The upload field the pointer is over, if any: { inputs, box }.
  // When boxes are nested, the smallest one under the pointer wins.
  function uploadAt(x, y) {
    let best = null, bestArea = Infinity;
    for (const { input, boxes } of uploadBoxes()) {
      for (const box of boxes) {
        const r = box.getBoundingClientRect();
        if (x < r.left || x > r.right || y < r.top || y > r.bottom) continue;
        const area = r.width * r.height;
        if (area < bestArea) { best = { inputs: [input], box }; bestArea = area; }
        else if (area === bestArea && !best.inputs.includes(input)) best.inputs.push(input);
      }
    }
    return best;
  }

  function setHover(el) {
    if (hovered === el) return;
    clearHover();
    hovered = el;
    if (el) {
      el.dataset.hiretrackrOutline = el.style.outline;
      el.style.outline = '2px dashed #2e9e6b';
    }
  }

  function clearHover() {
    if (!hovered) return;
    hovered.style.outline = hovered.dataset.hiretrackrOutline || '';
    delete hovered.dataset.hiretrackrOutline;
    hovered = null;
  }

  function onDragOver(e) {
    if (!dragging || !e.isTrusted) return;
    // Take the event so a page handler can't refuse a drag that has no files in it
    e.preventDefault();
    e.stopImmediatePropagation();
    e.dataTransfer.dropEffect = 'copy';
    if (e.type !== 'dragover') return;
    const upload = uploadAt(e.clientX, e.clientY);
    setHover(upload ? upload.box : realTarget(e));
  }

  function onDragLeave(e) {
    if (dragging && e.isTrusted && !e.relatedTarget) clearHover();
  }

  async function onDrop(e) {
    if (!dragging || !e.isTrusted) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const target = realTarget(e);
    const point = { clientX: e.clientX, clientY: e.clientY };
    dragging = false;
    clearHover();

    let data = null;
    try {
      data = await chrome.runtime.sendMessage({ type: 'HT_GET_DRAGGED_CV' });
    } catch (err) {
      // side panel closed or not answering
    }
    if (!data) {
      chrome.runtime.sendMessage({ type: 'HT_DROP_RESULT', ok: false }).catch(() => {});
      return;
    }

    const file = toFile(data);
    uploads = null;   // look at the page as it is right now
    const upload = uploadAt(point.clientX, point.clientY);
    const input = upload && bestUpload(upload.inputs, data).input;

    if (input) {
      setInputFile(input, file);
      chrome.runtime.sendMessage({ type: 'HT_DROP_RESULT', ok: true, via: 'input' }).catch(() => {});
      return;
    }

    // No upload field under the pointer: give the site's own drop zone a drop carrying the file.
    // These events are not "trusted", so our own listeners above ignore them.
    const dataTransfer = transferWith(file);
    for (const type of ['dragenter', 'dragover', 'drop']) {
      target.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, composed: true, dataTransfer, ...point }));
    }
    chrome.runtime.sendMessage({ type: 'HT_DROP_RESULT', ok: true, via: 'dropzone' }).catch(() => {});
  }

  window.addEventListener('dragenter', onDragOver, true);
  window.addEventListener('dragover', onDragOver, true);
  window.addEventListener('dragleave', onDragLeave, true);
  window.addEventListener('drop', onDrop, true);

  function dragStart() {
    dragging = true;
    clearTimeout(dragTimer);
    dragTimer = setTimeout(dragEnd, 60000);   // never stay armed if the panel goes away
  }

  function dragEnd() {
    dragging = false;
    clearTimeout(dragTimer);
    clearHover();
  }

  globalThis.__hiretrackr = { fill, scanUpload, attach, dragStart, dragEnd };
})();
