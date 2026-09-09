const nativeFetch = window.fetch.bind(window);
const API_BASE = '/api';

function authHeaders() {
  const token = localStorage.getItem('vrm_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function money(n) {
  return `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

function closeOverlay(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

function showInfoModal({ title, kicker, content, confirmText = 'Continue', id = 'vrm-info-modal' }) {
  closeOverlay(id);
  const wrap = document.createElement('div');
  wrap.id = id;
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = `
    <div class="modal" style="max-width:620px">
      <div class="modal-head">
        <div><p class="eyebrow">${kicker || 'RENTAL DETAILS'}</p><h2>${title}</h2></div>
        <button class="icon-btn" data-close>×</button>
      </div>
      <div style="margin-top:18px">${content}</div>
      <div class="modal-foot" style="margin-top:20px">
        <button class="btn secondary" data-close>Cancel</button>
        <button class="btn primary" data-confirm>${confirmText}</button>
      </div>
    </div>`;
  wrap.querySelectorAll('[data-close]').forEach(b => b.onclick = () => { closeOverlay(id); });
  document.body.appendChild(wrap);
  return new Promise(resolve => {
    wrap.querySelector('[data-confirm]').onclick = () => { closeOverlay(id); resolve(true); };
    wrap.querySelector('[data-close]').onclick = () => { closeOverlay(id); resolve(false); };
  });
}

function applyAddonPresentation() {
  document.querySelectorAll('.addon-grid').forEach(grid => {
    if (grid.dataset.vroomEnhanced === '1') return;
    grid.dataset.vroomEnhanced = '1';
    grid.querySelectorAll('.addon').forEach(card => {
      const text = card.querySelector('b');
      if (text) text.textContent = card.classList.contains('selected') ? 'Selected · charged by branch' : 'Optional · branch charge at return';
    });
    const note = document.createElement('p');
    note.className = 'muted';
    note.style.margin = '4px 0 14px';
    note.textContent = 'Add-ons are optional. Any applicable extra charges are set by the selected branch and included in the final bill after the vehicle is returned.';
    grid.parentNode.insertBefore(note, grid);

    const summary = grid.parentNode.querySelector('.summary-box');
    if (summary) {
      const rows = Array.from(summary.children);
      rows.forEach(row => {
        const label = row.querySelector('span')?.textContent?.trim();
        if (label === 'Add-ons') row.remove();
      });
      const total = summary.querySelector('.total');
      if (total) {
        const label = total.querySelector('span');
        if (label) label.textContent = 'Rental amount';
      }
      const billNote = document.createElement('div');
      billNote.style.cssText = 'font-size:11px;color:#718079;padding-top:8px;line-height:1.5';
      billNote.textContent = 'Final bill = rental + applicable branch add-ons + excess KM + fuel adjustment + damage charges. Generated after return inspection.';
      summary.appendChild(billNote);
    }
  });
}

function bookingAddOnNames(booking) {
  const selected = Array.isArray(booking?.selectedAddOns) ? booking.selectedAddOns : [];
  return selected.map(a => typeof a === 'object' ? (a.label || a.type) : String(a)).filter(Boolean);
}

async function showPickupDetails(bookingId) {
  try {
    const res = await nativeFetch(`${API_BASE}/bookings/${bookingId}`, { headers: authHeaders() });
    const data = await res.json();
    if (!res.ok || !data?.data) return true;
    const b = data.data;
    const addOns = bookingAddOnNames(b);
    const content = `
      <div class="summary-box" style="border-top:0;margin-top:0">
        <div><span>Customer</span><b>${b.customerId?.name || '—'}</b></div>
        <div><span>Email</span><b>${b.customerId?.email || '—'}</b></div>
        <div><span>Vehicle</span><b>${b.vehicleId?.name || '—'}</b></div>
        <div><span>Pickup</span><b>${new Date(b.startDate).toLocaleString('en-IN')}</b></div>
        <div><span>Return</span><b>${new Date(b.endDate).toLocaleString('en-IN')}</b></div>
        <div><span>Booked add-ons</span><b>${addOns.length ? addOns.join(', ') : 'None selected'}</b></div>
      </div>
      <p class="muted" style="margin:4px 0 0">Record the pickup odometer and fuel level entered in the previous prompt, then complete the pickup.</p>`;
    return await showInfoModal({ title: 'Pickup checklist', kicker: 'BEFORE HANDOVER', content, confirmText: 'Complete pickup' });
  } catch {
    return true;
  }
}

function showReturnBill(payload) {
  const booking = payload?.booking || {};
  const s = payload?.settlement || {};
  const addOnAmount = Number(booking.addOnAmount || 0);
  const base = Number(booking.baseAmount || 0);
  const extra = Number(s.extraCharge || 0);
  const fuel = Number(s.fuelAdjustment || 0);
  const damage = Number(s.damageCharge || 0);
  const finalTotal = Number(s.finalTotal ?? booking.totalAmount ?? 0);
  const fuelLabel = fuel > 0 ? 'Fuel charge' : fuel < 0 ? 'Fuel credit' : 'Fuel adjustment';
  const fuelDisplay = fuel < 0 ? `−${money(Math.abs(fuel))}` : money(fuel);
  const addOns = bookingAddOnNames(booking);

  const content = `
    <div class="summary-box" style="border-top:0;margin-top:0">
      <div><span>Vehicle</span><b>${booking.vehicleId?.name || '—'}</b></div>
      <div><span>Rental</span><b>${money(base)}</b></div>
      <div><span>Branch add-ons${addOns.length ? ` (${addOns.join(', ')})` : ''}</span><b>${money(addOnAmount)}</b></div>
      <div><span>Travelled KM</span><b>${Number(s.travelledKm || 0).toLocaleString('en-IN')} km</b></div>
      <div><span>Excess KM</span><b>${Number(s.extraKm || 0).toLocaleString('en-IN')} km · ${money(extra)}</b></div>
      <div><span>${fuelLabel}</span><b>${fuelDisplay}</b></div>
      <div><span>Damage charges</span><b>${money(damage)}</b></div>
      <div class="total"><span>Final bill</span><b>${money(finalTotal)}</b></div>
    </div>
    <div style="padding:11px 13px;border-radius:10px;background:#eef5f2;font-size:11px;color:#315f55;line-height:1.55">
      Return inspection completed. This is the final bill breakdown for the rental.
    </div>`;
  showInfoModal({ title: 'Final bill', kicker: 'RETURN SETTLEMENT', content, confirmText: 'Done', id: 'vrm-bill-modal' });
}

const wrappedFetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : input?.url || '';
  const method = (init.method || input?.method || 'GET').toUpperCase();

  const pickupMatch = url.match(/\/api\/bookings\/([^/]+)\/pickup$/);
  if (pickupMatch && method === 'POST') {
    const proceed = await showPickupDetails(pickupMatch[1]);
    if (!proceed) return new Response(JSON.stringify({ success: false, message: 'Pickup cancelled' }), { status: 499, headers: { 'Content-Type': 'application/json' } });
  }

  const response = await nativeFetch(input, init);
  const returnMatch = url.match(/\/api\/bookings\/([^/]+)\/return$/);
  if (returnMatch && method === 'POST' && response.ok) {
    try {
      const payload = await response.clone().json();
      setTimeout(() => showReturnBill(payload), 80);
    } catch {}
  }
  return response;
};

window.fetch = wrappedFetch;

const observer = new MutationObserver(() => applyAddonPresentation());
observer.observe(document.documentElement, { childList: true, subtree: true });
setTimeout(applyAddonPresentation, 300);
