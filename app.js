(() => {
  'use strict';

  const MAX_SELECTED_OBJECTS = 250;
  const PROPERTY_BATCH_SIZE = 80;
  const MARKUP_BATCH_SIZE = 100;
  const STORAGE_PREFIX = 'tc-pset-viewer:v1:';

  const state = {
    api: null,
    objects: [],
    psets: [],
    activePset: '',
    propertyRows: [],
    activeTab: 'table',
    refreshTimer: null,
    isRefreshing: false,
    isCreatingStamps: false,
    createdMarkupIds: [],
  };

  const el = {};

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    mapElements();
    bindUiEvents();
    loadStampSettings();

    if (!window.TrimbleConnectWorkspace) {
      setConnection('error', 'API mangler');
      showMessage('Kunne ikke laste Trimble Connect Workspace API.', 'error');
      return;
    }

    try {
      state.api = await window.TrimbleConnectWorkspace.connect(
        window.parent,
        (event, data) => handleWorkspaceEvent(event, data),
        30000
      );
      setConnection('ok', 'Tilkoblet');
      await refreshSelection();
    } catch (error) {
      console.error(error);
      setConnection('error', 'Ikke tilkoblet');
      showMessage('Kunne ikke koble til Trimble Connect. Åpne løsningen som en 3D-extension i et prosjekt.', 'error');
    }
  }

  function mapElements() {
    [
      'connectionBadge','refreshButton','objectTitle','objectMeta','selectionHint',
      'psetSelect','psetCoverage','propertySearch','onlyWithValue','propertySummary',
      'propertyTableBody','copyPsetButton','csvButton','rowConfig','cardPreview',
      'addRowButton','copyCardButton','resetCardButton','messageBox','tableView','cardView',
      'stampColor','stampColorValue','numberRounding','createStampsButton','removeStampsButton','stampStatus'
    ].forEach(id => { el[id] = document.getElementById(id); });
    el.tabs = Array.from(document.querySelectorAll('.tab'));
  }

  function bindUiEvents() {
    el.refreshButton.addEventListener('click', () => refreshSelection(true));
    el.psetSelect.addEventListener('change', () => {
      state.activePset = el.psetSelect.value;
      persistLastPset();
      loadCardRows();
      renderAll();
    });
    el.propertySearch.addEventListener('input', renderPropertyTable);
    el.onlyWithValue.addEventListener('change', renderPropertyTable);
    el.copyPsetButton.addEventListener('click', copyActivePset);
    el.csvButton.addEventListener('click', exportActivePsetCsv);
    el.addRowButton.addEventListener('click', () => addCardRow());
    el.copyCardButton.addEventListener('click', copyCard);
    el.resetCardButton.addEventListener('click', resetCardRows);
    el.createStampsButton.addEventListener('click', createStamps);
    el.removeStampsButton.addEventListener('click', removeCreatedStamps);
    el.stampColor.addEventListener('input', () => {
      el.stampColorValue.textContent = el.stampColor.value.toUpperCase();
      saveStampSettings();
    });
    el.numberRounding.addEventListener('change', () => {
      saveStampSettings();
      renderCardPreview();
    });
    el.tabs.forEach(tab => tab.addEventListener('click', () => setTab(tab.dataset.tab)));
  }

  function handleWorkspaceEvent(event, data) {
    if (event === 'viewer.onSelectionChanged' || event === 'viewer.onModelStateChanged') {
      scheduleRefresh();
    }
  }

  function scheduleRefresh() {
    clearTimeout(state.refreshTimer);
    state.refreshTimer = setTimeout(() => refreshSelection(), 120);
  }

  async function refreshSelection(forceMessage = false) {
    if (!state.api?.viewer || state.isRefreshing) return;
    state.isRefreshing = true;
    el.refreshButton.disabled = true;

    try {
      const selection = await state.api.viewer.getSelection();
      const selectedBlocks = normalizeSelection(selection);
      const totalRequested = selectedBlocks.reduce((sum, b) => sum + b.ids.length, 0);

      if (!totalRequested) {
        state.objects = [];
        state.psets = [];
        state.activePset = '';
        state.propertyRows = [];
        renderAll();
        if (forceMessage) showMessage('Ingen objekter er valgt i 3D-visningen.', 'info');
        return;
      }

      const limited = limitSelection(selectedBlocks, MAX_SELECTED_OBJECTS);
      const loaded = [];

      for (const block of limited.blocks) {
        for (let i = 0; i < block.ids.length; i += PROPERTY_BATCH_SIZE) {
          const ids = block.ids.slice(i, i + PROPERTY_BATCH_SIZE);
          try {
            const props = await state.api.viewer.getObjectProperties(block.modelId, ids);
            for (let j = 0; j < ids.length; j++) {
              loaded.push({
                modelId: block.modelId,
                runtimeId: ids[j],
                data: props?.[j] || { id: ids[j], properties: [] },
              });
            }
          } catch (error) {
            console.warn('getObjectProperties feilet for en batch', error);
            for (const id of ids) {
              loaded.push({ modelId: block.modelId, runtimeId: id, data: { id, properties: [] } });
            }
          }
        }
      }

      state.objects = loaded;
      state.psets = collectPsets(loaded);
      chooseActivePset();
      loadCardRows();
      renderAll();

      if (limited.truncated) {
        showMessage(`Utvalget inneholder ${totalRequested} objekter. De første ${MAX_SELECTED_OBJECTS} er lastet for å holde visningen rask.`, 'info');
      } else if (forceMessage) {
        showMessage(`Oppdatert fra ${loaded.length} valgt${loaded.length === 1 ? '' : 'e'} objekt${loaded.length === 1 ? '' : 'er'}.`, 'success');
      }
    } catch (error) {
      console.error(error);
      showMessage('Kunne ikke lese utvalget eller egenskapene fra Trimble Connect.', 'error');
    } finally {
      state.isRefreshing = false;
      el.refreshButton.disabled = false;
    }
  }

  function normalizeSelection(selection) {
    if (!Array.isArray(selection)) return [];
    return selection.map(item => {
      const modelId = item?.modelId;
      let ids = [];
      if (Array.isArray(item?.objectRuntimeIds)) ids = item.objectRuntimeIds;
      else if (Array.isArray(item?.objects)) ids = item.objects.map(o => o?.id).filter(v => v !== undefined && v !== null);
      return { modelId, ids: ids.filter(v => Number.isFinite(Number(v))).map(v => Number(v)) };
    }).filter(b => b.modelId && b.ids.length);
  }

  function limitSelection(blocks, limit) {
    const out = [];
    let remaining = limit;
    let total = 0;
    for (const b of blocks) total += b.ids.length;
    for (const b of blocks) {
      if (remaining <= 0) break;
      const ids = b.ids.slice(0, remaining);
      if (ids.length) out.push({ modelId: b.modelId, ids });
      remaining -= ids.length;
    }
    return { blocks: out, truncated: total > limit };
  }

  function collectPsets(objects) {
    const map = new Map();
    for (const obj of objects) {
      for (const pset of getPropertySets(obj.data)) {
        const name = pset?.name || '(Uten navn)';
        const rec = map.get(name) || { name, count: 0, firstIndex: map.size };
        rec.count += 1;
        map.set(name, rec);
      }
    }
    return Array.from(map.values()).sort((a, b) => {
      const ap = /^pset_/i.test(a.name) ? 0 : 1;
      const bp = /^pset_/i.test(b.name) ? 0 : 1;
      return ap - bp || a.firstIndex - b.firstIndex || a.name.localeCompare(b.name, 'no');
    });
  }

  function chooseActivePset() {
    const available = new Set(state.psets.map(p => p.name));
    if (available.has(state.activePset)) return;
    const stored = localStorage.getItem(STORAGE_PREFIX + 'lastPset');
    if (stored && available.has(stored)) state.activePset = stored;
    else state.activePset = state.psets[0]?.name || '';
  }

  function persistLastPset() {
    if (state.activePset) localStorage.setItem(STORAGE_PREFIX + 'lastPset', state.activePset);
  }

  function getPropertySets(objectData) {
    return Array.isArray(objectData?.properties) ? objectData.properties : [];
  }

  function getPset(objectData, name) {
    return getPropertySets(objectData).find(p => (p?.name || '(Uten navn)') === name) || null;
  }

  function getProperties(pset) {
    return Array.isArray(pset?.properties) ? pset.properties : [];
  }

  function formatValue(raw) {
    if (raw === null || raw === undefined) return '';
    let value = raw;
    if (typeof value === 'object' && !Array.isArray(value) && value !== null && Object.prototype.hasOwnProperty.call(value, 'value')) {
      value = value.value;
    }
    if (value === null || value === undefined) return '';
    if (typeof value === 'boolean') return value ? 'Ja' : 'Nei';
    if (typeof value === 'bigint') return value.toString();
    if (Array.isArray(value)) return value.map(formatValue).filter(Boolean).join(', ');
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value, (_, v) => typeof v === 'bigint' ? v.toString() : v);
      } catch {
        return String(value);
      }
    }
    return String(value);
  }

  function getObjectDisplayName(obj) {
    const data = obj?.data || {};
    const product = data.product || {};
    return product.name || data.name || product.objectType || data.class || `Objekt ${obj?.runtimeId ?? ''}`;
  }

  function renderAll() {
    renderObjectPanel();
    renderPsetSelector();
    renderPropertyTable();
    renderCardConfig();
    updateButtons();
  }

  function renderObjectPanel() {
    if (!state.objects.length) {
      el.objectTitle.textContent = 'Velg et objekt i 3D-visningen';
      el.objectMeta.classList.add('hidden');
      el.objectMeta.innerHTML = '';
      el.selectionHint.textContent = 'Egenskapene oppdateres automatisk når du endrer utvalget i Trimble Connect.';
      return;
    }

    const first = state.objects[0];
    const modelCount = new Set(state.objects.map(o => o.modelId)).size;
    el.objectTitle.textContent = state.objects.length === 1 ? getObjectDisplayName(first) : `${state.objects.length} valgte objekter`;

    const meta = [
      ['IFC-klasse', first.data?.class || '—'],
      ['Objekt-ID', String(first.runtimeId ?? '—')],
      ['Modell', modelCount === 1 ? String(first.modelId) : `${modelCount} modeller`],
      ['PSet', String(state.psets.length)],
    ];
    el.objectMeta.innerHTML = meta.map(([k, v]) => `<div class="meta-item"><span>${escapeHtml(k)}</span><strong>${escapeHtml(v)}</strong></div>`).join('');
    el.objectMeta.classList.remove('hidden');
    el.selectionHint.textContent = state.objects.length > 1
      ? 'Ved flervalg vises felles verdi når den er lik. Ulike verdier merkes som «Varierer».'
      : 'Velg et annet objekt i 3D-visningen for å oppdatere panelet.';
  }

  function renderPsetSelector() {
    const prev = state.activePset;
    el.psetSelect.innerHTML = '';

    if (!state.psets.length) {
      const opt = new Option(state.objects.length ? 'Ingen Property Sets funnet' : 'Velg først et objekt', '');
      el.psetSelect.add(opt);
      el.psetSelect.disabled = true;
      el.psetCoverage.textContent = '';
      return;
    }

    for (const p of state.psets) {
      const label = state.objects.length > 1 ? `${p.name} (${p.count}/${state.objects.length})` : p.name;
      el.psetSelect.add(new Option(label, p.name));
    }
    el.psetSelect.disabled = false;
    el.psetSelect.value = state.psets.some(p => p.name === prev) ? prev : state.psets[0].name;
    state.activePset = el.psetSelect.value;

    const active = state.psets.find(p => p.name === state.activePset);
    el.psetCoverage.textContent = active
      ? (state.objects.length > 1 ? `PSet finnes på ${active.count} av ${state.objects.length} valgte objekter.` : 'Viser egenskaper fra valgt PSet.')
      : '';
  }

  function buildPropertyRows() {
    if (!state.activePset || !state.objects.length) return [];

    const order = [];
    const seen = new Set();
    for (const obj of state.objects) {
      const pset = getPset(obj.data, state.activePset);
      for (const prop of getProperties(pset)) {
        const name = prop?.name || '(Uten navn)';
        if (!seen.has(name)) {
          seen.add(name);
          order.push(name);
        }
      }
    }

    return order.map(name => {
      const values = [];
      let present = 0;
      for (const obj of state.objects) {
        const pset = getPset(obj.data, state.activePset);
        const prop = getProperties(pset).find(p => (p?.name || '(Uten navn)') === name);
        const display = formatValue(prop?.value);
        if (display !== '') present += 1;
        values.push(display);
      }
      const nonEmpty = values.filter(v => v !== '');
      const unique = Array.from(new Set(nonEmpty));
      let displayValue = '';
      let varies = false;
      if (!nonEmpty.length) displayValue = '';
      else if (unique.length === 1) displayValue = unique[0];
      else { displayValue = 'Varierer'; varies = true; }
      return { name, values, present, unique, displayValue, varies };
    });
  }

  function renderPropertyTable() {
    const rows = buildPropertyRows();
    const query = (el.propertySearch?.value || '').trim().toLowerCase();
    const onlyWithValue = Boolean(el.onlyWithValue?.checked);
    const filtered = rows.filter(row => {
      if (onlyWithValue && row.present === 0) return false;
      if (!query) return true;
      const hay = [row.name, row.displayValue, ...row.unique].join(' ').toLowerCase();
      return hay.includes(query);
    });

    state.propertyRows = rows;
    el.propertyTableBody.innerHTML = '';

    if (!state.activePset || !filtered.length) {
      el.propertyTableBody.innerHTML = `<tr class="empty-row"><td colspan="3">${state.activePset ? 'Ingen egenskaper matcher filteret.' : 'Velg et PSet for å vise egenskaper.'}</td></tr>`;
      el.propertySummary.classList.add('hidden');
      return;
    }

    const total = state.objects.length;
    for (const row of filtered) {
      const tr = document.createElement('tr');
      const tdName = document.createElement('td');
      tdName.innerHTML = `<span class="property-name">${escapeHtml(row.name)}</span>`;

      const tdValue = document.createElement('td');
      if (!row.present) {
        tdValue.innerHTML = '<span class="value-muted">Ingen verdi</span>';
      } else if (row.varies) {
        const samples = row.unique.slice(0, 4).map(v => escapeHtml(v)).join(' · ');
        const more = row.unique.length > 4 ? ` · +${row.unique.length - 4} til` : '';
        tdValue.innerHTML = `<span class="variation">Varierer (${row.unique.length} verdier)</span><div class="variation-details">${samples}${more}</div>`;
      } else {
        tdValue.textContent = row.displayValue;
        if (row.present < total) {
          const note = document.createElement('div');
          note.className = 'variation-details';
          note.textContent = `Mangler på ${total - row.present} objekt${total - row.present === 1 ? '' : 'er'}`;
          tdValue.appendChild(note);
        }
      }

      const tdCoverage = document.createElement('td');
      tdCoverage.className = 'coverage-col';
      const coverageClass = row.present === total ? 'full' : row.present > 0 ? 'partial' : '';
      tdCoverage.innerHTML = `<span class="coverage-pill ${coverageClass}">${row.present}/${total}</span>`;

      tr.append(tdName, tdValue, tdCoverage);
      el.propertyTableBody.appendChild(tr);
    }

    el.propertySummary.textContent = `${filtered.length} av ${rows.length} egenskaper vises · ${state.objects.length} objekt${state.objects.length === 1 ? '' : 'er'} valgt`;
    el.propertySummary.classList.remove('hidden');
  }

  function getActivePropertyNames() {
    return buildPropertyRows().map(r => r.name);
  }

  function getObjectPropertyValue(object, propertyName) {
    if (!object || !state.activePset) return '';
    const pset = getPset(object.data, state.activePset);
    const prop = getProperties(pset).find(p => (p?.name || '(Uten navn)') === propertyName);
    return formatStampValue(prop?.value);
  }

  function formatStampValue(raw) {
    const value = formatValue(raw);
    const rounding = el.numberRounding?.value || 'none';
    if (rounding === 'none' || !/^[-+]?\d+(?:[.,]\d+)?(?:e[-+]?\d+)?$/i.test(value.trim())) return value;
    const numeric = Number(value.trim().replace(',', '.'));
    if (!Number.isFinite(numeric)) return value;
    const digits = Number(rounding);
    return new Intl.NumberFormat('nb-NO', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
      useGrouping: false,
    }).format(numeric);
  }

  function loadCardRows() {
    if (!state.activePset) {
      state.cardRows = [];
      return;
    }
    const key = STORAGE_PREFIX + 'card:' + state.activePset;
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || '[]');
      if (Array.isArray(parsed)) state.cardRows = parsed.filter(r => r && typeof r.property === 'string').slice(0, 10);
      else state.cardRows = [];
    } catch {
      state.cardRows = [];
    }

    if (!state.cardRows.length) {
      const names = getActivePropertyNames();
      state.cardRows = names.slice(0, Math.min(2, names.length)).map(property => ({ property, prefix: '', suffix: '' }));
    }
  }

  function saveCardRows() {
    if (!state.activePset) return;
    localStorage.setItem(STORAGE_PREFIX + 'card:' + state.activePset, JSON.stringify(state.cardRows || []));
  }

  function addCardRow() {
    const names = getActivePropertyNames();
    if (!names.length || (state.cardRows || []).length >= 10) return;
    const used = new Set((state.cardRows || []).map(r => r.property));
    const next = names.find(n => !used.has(n)) || names[0];
    state.cardRows = [...(state.cardRows || []), { property: next, prefix: '', suffix: '' }];
    saveCardRows();
    renderCardConfig();
    updateButtons();
  }

  function resetCardRows() {
    if (!state.activePset) return;
    localStorage.removeItem(STORAGE_PREFIX + 'card:' + state.activePset);
    const names = getActivePropertyNames();
    state.cardRows = names.slice(0, Math.min(2, names.length)).map(property => ({ property, prefix: '', suffix: '' }));
    renderCardConfig();
    updateButtons();
  }

  function renderCardConfig() {
    const names = getActivePropertyNames();
    const rows = state.cardRows || [];
    el.rowConfig.innerHTML = '';

    if (!state.activePset || !names.length) {
      el.rowConfig.innerHTML = '<div class="hint">Ingen egenskaper er tilgjengelige i valgt PSet.</div>';
      el.cardPreview.innerHTML = '<div class="preview-placeholder">Velg et PSet med egenskaper.</div>';
      return;
    }

    rows.forEach((row, index) => {
      if (!names.includes(row.property)) row.property = names[0];
      const wrapper = document.createElement('div');
      wrapper.className = 'config-row';
      wrapper.innerHTML = `
        <div class="config-row-head">
          <strong>Rad ${index + 1}</strong>
          <button class="delete-row" type="button" data-action="delete">✕ Fjern</button>
        </div>
        <div class="config-grid">
          <label>Egenskap<select data-field="property"></select></label>
          <label>Prefiks<input type="text" data-field="prefix" value="${escapeAttr(row.prefix || '')}" placeholder="f.eks. ID: " /></label>
          <label>Suffiks<input type="text" data-field="suffix" value="${escapeAttr(row.suffix || '')}" placeholder="f.eks. mm" /></label>
        </div>`;

      const select = wrapper.querySelector('[data-field="property"]');
      names.forEach(name => select.add(new Option(name, name)));
      select.value = row.property;

      wrapper.querySelector('[data-action="delete"]').addEventListener('click', () => {
        state.cardRows.splice(index, 1);
        saveCardRows();
        renderCardConfig();
        updateButtons();
      });

      wrapper.querySelectorAll('[data-field]').forEach(control => {
        control.addEventListener('input', () => {
          const field = control.dataset.field;
          state.cardRows[index][field] = control.value;
          saveCardRows();
          renderCardPreview();
          updateButtons();
        });
        control.addEventListener('change', () => {
          const field = control.dataset.field;
          state.cardRows[index][field] = control.value;
          saveCardRows();
          renderCardPreview();
          updateButtons();
        });
      });

      el.rowConfig.appendChild(wrapper);
    });

    renderCardPreview();
  }

  function buildCardText(object = state.objects[0]) {
    return (state.cardRows || []).map(row => {
      const value = getObjectPropertyValue(object, row.property);
      return `${row.prefix || ''}${value || '—'}${row.suffix || ''}`;
    }).join('\n');
  }

  function renderCardPreview() {
    const text = buildCardText();
    if (!text) {
      el.cardPreview.innerHTML = '<div class="preview-placeholder">Legg til minst én rad.</div>';
    } else {
      el.cardPreview.textContent = text;
    }
  }

  function loadStampSettings() {
    try {
      const settings = JSON.parse(localStorage.getItem(STORAGE_PREFIX + 'stampSettings') || '{}');
      if (/^#[0-9a-f]{6}$/i.test(settings.color || '')) el.stampColor.value = settings.color;
      if (['none', '0', '1', '2', '3'].includes(String(settings.rounding))) {
        el.numberRounding.value = String(settings.rounding);
      }
    } catch {
      // Bruk standardinnstillinger dersom lagret verdi ikke kan leses.
    }
    el.stampColorValue.textContent = el.stampColor.value.toUpperCase();
  }

  function saveStampSettings() {
    localStorage.setItem(STORAGE_PREFIX + 'stampSettings', JSON.stringify({
      color: el.stampColor.value,
      rounding: el.numberRounding.value,
    }));
  }

  function hexToRgba(hex) {
    const normalized = String(hex || '#f28c00').replace('#', '');
    return {
      r: parseInt(normalized.slice(0, 2), 16),
      g: parseInt(normalized.slice(2, 4), 16),
      b: parseInt(normalized.slice(4, 6), 16),
      a: 255,
    };
  }

  async function createStamps() {
    if (!state.api?.markup || !state.objects.length || !(state.cardRows || []).length || state.isCreatingStamps) return;
    state.isCreatingStamps = true;
    updateButtons();
    el.stampStatus.textContent = 'Oppretter 3D-stempler …';

    const groups = new Map();
    for (const object of state.objects) {
      if (!groups.has(object.modelId)) groups.set(object.modelId, []);
      groups.get(object.modelId).push(object);
    }

    const newIds = [];
    let createdCount = 0;
    let failedCount = 0;

    try {
      for (const [modelId, objects] of groups) {
        for (let i = 0; i < objects.length; i += MARKUP_BATCH_SIZE) {
          const batch = objects.slice(i, i + MARKUP_BATCH_SIZE);
          try {
            const boxes = await state.api.viewer.getObjectBoundingBoxes(modelId, batch.map(o => o.runtimeId));
            const objectById = new Map(batch.map(o => [Number(o.runtimeId), o]));
            const markups = [];

            for (const entry of boxes || []) {
              const box = entry?.boundingBox;
              const object = objectById.get(Number(entry?.id));
              if (!box?.min || !box?.max || !object) continue;
              const point = {
                positionX: ((Number(box.min.x) + Number(box.max.x)) / 2) * 1000,
                positionY: ((Number(box.min.y) + Number(box.max.y)) / 2) * 1000,
                positionZ: ((Number(box.min.z) + Number(box.max.z)) / 2) * 1000,
                modelId,
                objectId: object.runtimeId,
                type: 'point',
              };
              markups.push({
                text: buildCardText(object),
                start: point,
                end: { ...point },
                color: hexToRgba(el.stampColor.value),
              });
            }

            if (markups.length) {
              const added = await state.api.markup.addTextMarkup(markups);
              createdCount += added?.length || markups.length;
              for (const markup of added || []) {
                if (Number.isFinite(Number(markup?.id))) newIds.push(Number(markup.id));
              }
            }
            failedCount += Math.max(0, batch.length - markups.length);
          } catch (error) {
            console.warn('Kunne ikke opprette stempler for en objektgruppe', error);
            failedCount += batch.length;
          }
        }
      }

      state.createdMarkupIds = Array.from(new Set([...state.createdMarkupIds, ...newIds]));
      if (!createdCount) throw new Error('Ingen stempler ble opprettet');
      const failedText = failedCount ? ` ${failedCount} objekt${failedCount === 1 ? '' : 'er'} kunne ikke stemples.` : '';
      el.stampStatus.textContent = `${createdCount} 3D-stempel${createdCount === 1 ? '' : 'er'} er opprettet.${failedText}`;
      showMessage(`${createdCount} 3D-stempel${createdCount === 1 ? '' : 'er'} opprettet.`, failedCount ? 'info' : 'success');
    } catch (error) {
      console.error(error);
      el.stampStatus.textContent = 'Kunne ikke opprette 3D-stempler. Kontroller at modellen støtter markups.';
      showMessage('Oppretting av 3D-stempel feilet.', 'error');
    } finally {
      state.isCreatingStamps = false;
      updateButtons();
    }
  }

  async function removeCreatedStamps() {
    if (!state.api?.markup || !state.createdMarkupIds.length || state.isCreatingStamps) return;
    state.isCreatingStamps = true;
    updateButtons();
    const count = state.createdMarkupIds.length;
    try {
      await state.api.markup.removeMarkups([...state.createdMarkupIds]);
      state.createdMarkupIds = [];
      el.stampStatus.textContent = `${count} opprettet${count === 1 ? '' : 'e'} stempel${count === 1 ? '' : 'er'} ble fjernet.`;
      showMessage('Opprettede 3D-stempler er fjernet.', 'success');
    } catch (error) {
      console.error(error);
      el.stampStatus.textContent = 'Kunne ikke fjerne stemplene.';
      showMessage('Fjerning av 3D-stempler feilet.', 'error');
    } finally {
      state.isCreatingStamps = false;
      updateButtons();
    }
  }

  function updateButtons() {
    const hasPset = Boolean(state.activePset && state.objects.length);
    el.copyPsetButton.disabled = !hasPset;
    el.csvButton.disabled = !hasPset;
    el.addRowButton.disabled = !hasPset || !getActivePropertyNames().length || (state.cardRows || []).length >= 10;
    el.copyCardButton.disabled = !hasPset || !(state.cardRows || []).length;
    el.resetCardButton.disabled = !hasPset;
    el.createStampsButton.disabled = !hasPset || !(state.cardRows || []).length || state.isCreatingStamps || !state.api?.markup;
    el.removeStampsButton.disabled = !state.createdMarkupIds.length || state.isCreatingStamps || !state.api?.markup;
  }

  function setTab(tab) {
    state.activeTab = tab === 'card' ? 'card' : 'table';
    el.tabs.forEach(t => {
      const active = t.dataset.tab === state.activeTab;
      t.classList.toggle('active', active);
      t.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    el.tableView.classList.toggle('active', state.activeTab === 'table');
    el.cardView.classList.toggle('active', state.activeTab === 'card');
  }

  async function copyActivePset() {
    const rows = buildPropertyRows();
    if (!rows.length) return;
    const text = [state.activePset, ...rows.map(r => `${r.name}: ${r.displayValue || '—'}`)].join('\n');
    await copyText(text, 'PSet er kopiert til utklippstavlen.');
  }

  async function copyCard() {
    const text = buildCardText();
    if (!text) return;
    await copyText(text, 'Kortvisningen er kopiert til utklippstavlen.');
  }

  async function copyText(text, successMessage) {
    try {
      await navigator.clipboard.writeText(text);
      showMessage(successMessage, 'success');
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      showMessage(successMessage, 'success');
    }
  }

  function exportActivePsetCsv() {
    const rows = buildPropertyRows();
    if (!rows.length) return;
    const lines = [['PSet', 'Egenskap', 'Verdi', 'Dekning']];
    for (const r of rows) lines.push([state.activePset, r.name, r.varies ? r.unique.join(' | ') : r.displayValue, `${r.present}/${state.objects.length}`]);
    const csv = '\ufeff' + lines.map(cols => cols.map(csvEscape).join(';')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeFileName(state.activePset)}_egenskaper.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showMessage('CSV-fil opprettet.', 'success');
  }

  function csvEscape(value) {
    const s = value === null || value === undefined ? '' : String(value);
    return `"${s.replaceAll('"', '""')}"`;
  }

  function safeFileName(value) {
    return String(value || 'PSet').replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_');
  }

  function setConnection(type, text) {
    el.connectionBadge.textContent = text;
    el.connectionBadge.className = 'badge ' + (type === 'ok' ? 'badge-ok' : type === 'error' ? 'badge-error' : 'badge-waiting');
  }

  let messageTimer;
  function showMessage(text, type = 'info') {
    clearTimeout(messageTimer);
    el.messageBox.textContent = text;
    el.messageBox.className = `message-box ${type}`;
    messageTimer = setTimeout(() => el.messageBox.classList.add('hidden'), 4500);
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch]));
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, '&#96;');
  }
})();
