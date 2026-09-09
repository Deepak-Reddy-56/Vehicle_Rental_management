const nativeFetch = window.fetch.bind(window);
const API_BASE = '/api';
const BACKEND_ORIGIN = `${window.location.protocol}//${window.location.hostname}:5000`;

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

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function showInfoModal({ title, kicker, content, confirmText = 'Done', id = 'vrm-info-modal' }) {
  closeOverlay(id);
  const wrap = document.createElement('div');
  wrap.id = id;
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = `
    <div class="modal" style="max-width:620px">
      <div class="modal-head">
        <div><p class="eyebrow">${escapeHtml(kicker || 'RENTAL DETAILS')}</p><h2>${escapeHtml(title)}</h2></div>
        <button class="icon-btn" data-close aria-label="Close">×</button>
      </div>
      <div style="margin-top:18px">${content}</div>
      <div class="modal-foot" style="margin-top:20px">
        <button class="btn primary" data-close>${escapeHtml(confirmText)}</button>
      </div>
    </div>`;
  wrap.querySelectorAll('[data-close]').forEach(button => {
    button.onclick = () => closeOverlay(id);
  });
  document.body.appendChild(wrap);
}

function resolveImageUrl(src) {
  if (!src || typeof src !== 'string') return src;
  if (src.startsWith('blob:') || src.startsWith('data:') || /^https?:\/\//i.test(src)) return src;
  if (src.startsWith('/uploads/')) return `${BACKEND_ORIGIN}${src}`;
  return src;
}

function fixUploadedImageSources(root = document) {
  root.querySelectorAll?.('img[src^="/uploads/"]').forEach(img => {
    const src = img.getAttribute('src');
    const resolved = resolveImageUrl(src);
    if (resolved && img.src !== resolved) img.src = resolved;
  });
}

function bookingAddOnNames(booking) {
  const selected = Array.isArray(booking?.selectedAddOns) ? booking.selectedAddOns : [];
  return selected
    .map(a => typeof a === 'object' ? (a.label || a.type) : String(a))
    .filter(Boolean);
}

function renderBillContent(booking, settlement = {}) {
  const base = Number(booking?.baseAmount || 0);
  const addOnAmount = Number(booking?.addOnAmount || 0);
  const travelledKm = Number(settlement?.travelledKm || 0);
  const extraKm = Number(settlement?.extraKm || settlement?.extraKilometers || 0);
  const extraCharge = Number(settlement?.extraCharge || settlement?.extraKilometerCharge || 0);
  const fuel = Number(settlement?.fuelAdjustment ?? settlement?.fuelCharge ?? 0);
  const damage = Number(settlement?.damageCharge || 0);
  const finalTotal = Number(settlement?.finalTotal ?? booking?.totalAmount ?? 0);
  const addOns = bookingAddOnNames(booking);
  const fuelLabel = fuel > 0 ? 'Fuel charge' : fuel < 0 ? 'Fuel credit' : 'Fuel adjustment';
  const fuelDisplay = fuel < 0 ? `−${money(Math.abs(fuel))}` : money(fuel);

  return `
    <div class="summary-box" style="border-top:0;margin-top:0">
      <div><span>Vehicle</span><b>${escapeHtml(booking?.vehicleId?.name || '—')}</b></div>
      <div><span>Rental amount</span><b>${money(base)}</b></div>
      <div><span>Optional add-ons${addOns.length ? ` (${escapeHtml(addOns.join(', '))})` : ''}</span><b>${money(addOnAmount)}</b></div>
      <div><span>Travelled KM</span><b>${travelledKm.toLocaleString('en-IN')} km</b></div>
      <div><span>Excess KM</span><b>${extraKm.toLocaleString('en-IN')} km</b></div>
      <div><span>Excess KM charge</span><b>${money(extraCharge)}</b></div>
      <div><span>${fuelLabel}</span><b>${fuelDisplay}</b></div>
      <div><span>Damage charges</span><b>${money(damage)}</b></div>
      <div class="total"><span>Final bill</span><b>${money(finalTotal)}</b></div>
    </div>
    <div style="padding:11px 13px;border-radius:10px;background:#eef5f2;font-size:11px;color:#315f55;line-height:1.55">
      Final amount calculated from the completed return inspection. Any branch-configured extras are included in the settlement above.
    </div>`;
}

function showReturnBill(payload) {
  const booking = payload?.booking || {};
  const settlement = payload?.settlement || {};
  const bill = { booking, settlement, savedAt: new Date().toISOString() };
  if (booking?._id) {
    localStorage.setItem(`vrm_final_bill_${booking._id}`, JSON.stringify(bill));
  }

  showInfoModal({
    title: 'Final bill',
    kicker: 'RETURN SETTLEMENT',
    content: renderBillContent(booking, settlement),
    confirmText: 'Done',
    id: 'vrm-bill-modal'
  });
}

async function showStoredOrFetchedBill(bookingId) {
  try {
    const stored = localStorage.getItem(`vrm_final_bill_${bookingId}`);
    if (stored) {
      const parsed = JSON.parse(stored);
      showInfoModal({
        title: 'Final bill',
        kicker: 'RETURN SETTLEMENT',
        content: renderBillContent(parsed.booking, parsed.settlement),
        confirmText: 'Done',
        id: 'vrm-bill-modal'
      });
      return;
    }

    const response = await nativeFetch(`${API_BASE}/bookings/${bookingId}`, { headers: authHeaders() });
    const data = await response.json();
    if (!response.ok || !data?.data) throw new Error('Bill unavailable');

    const booking = data.data;
    const fallbackSettlement = {
      finalTotal: booking.totalAmount,
      fuelAdjustment: 0,
      damageCharge: 0,
      extraKm: 0,
      extraCharge: 0,
      travelledKm: 0
    };

    showInfoModal({
      title: 'Final bill',
      kicker: 'RETURN SETTLEMENT',
      content: renderBillContent(booking, fallbackSettlement),
      confirmText: 'Done',
      id: 'vrm-bill-modal'
    });
  } catch {
    showInfoModal({
      title: 'Bill unavailable',
      kicker: 'RETURN SETTLEMENT',
      content: '<p class="muted">The final bill is not available for this rental yet.</p>',
      confirmText: 'Close',
      id: 'vrm-bill-modal'
    });
  }
}

function applyAddonPresentation() {
  fixUploadedImageSources();
  document.querySelectorAll('.addon-grid').forEach(grid => {
    if (grid.dataset.vroomEnhanced === '1') return;
    grid.dataset.vroomEnhanced = '1';

    grid.querySelectorAll('.addon').forEach(card => {
      const text = card.querySelector('b');
      if (text) {
        text.textContent = card.classList.contains('selected')
          ? 'Selected · branch charge at return'
          : 'Optional · branch charge at return';
      }
    });

    const note = document.createElement('p');
    note.className = 'muted';
    note.style.margin = '4px 0 14px';
    note.textContent = 'Add-ons are optional. Applicable extra charges are set by the selected branch and included in the final bill after the vehicle is returned.';
    grid.parentNode.insertBefore(note, grid);

    const summary = grid.parentNode.querySelector('.summary-box');
    if (summary) {
      Array.from(summary.children).forEach(row => {
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
      billNote.textContent = 'The final bill is calculated after return inspection using excess KM, fuel adjustment, damage and applicable branch add-ons.';
      summary.appendChild(billNote);
    }
  });
}

async function fetchCustomerBookings() {
  try {
    const rawUser = localStorage.getItem('vrm_user');
    if (!rawUser) return [];
    const user = JSON.parse(rawUser);
    if (!user?.id || user.role !== 'CUSTOMER') return [];
    const response = await nativeFetch(`${API_BASE}/customers/${user.id}/bookings`, { headers: authHeaders() });
    const data = await response.json();
    return response.ok && Array.isArray(data?.data) ? data.data : [];
  } catch {
    return [];
  }
}

async function applyCustomerBillButtons() {
  if (!document.querySelector('.history-list')) return;
  const bookings = await fetchCustomerBookings();
  if (!bookings.length) return;

  const returned = bookings.filter(b => b.status === 'RETURNED');
  if (!returned.length) return;

  const cards = Array.from(document.querySelectorAll('.history-list .booking-card'));
  returned.forEach(booking => {
    const match = cards.find(card => {
      const cardText = card.textContent || '';
      const vehicleName = booking.vehicleId?.name || '';
      const start = new Date(booking.startDate).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
      return cardText.includes(vehicleName) && cardText.includes(start);
    });
    if (!match || match.querySelector('[data-vroom-bill]')) return;

    const button = document.createElement('button');
    button.className = 'btn ghost';
    button.type = 'button';
    button.dataset.vroomBill = '1';
    button.textContent = 'View bill';
    button.onclick = () => showStoredOrFetchedBill(booking._id);

    const meta = match.querySelector('.booking-meta');
    if (meta) meta.appendChild(button);
  });
}

const wrappedFetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : input?.url || '';
  const method = (init.method || input?.method || 'GET').toUpperCase();

  const pickupMatch = url.match(/\/api\/bookings\/([^/]+)\/pickup$/);
  if (pickupMatch && method === 'POST') {
    const proceed = await showPickupDetails(pickupMatch[1]);
    if (!proceed) {
      return new Response(JSON.stringify({ success: false, message: 'Pickup cancelled' }), {
        status: 499,
        headers: { 'Content-Type': 'application/json' }
      });
    }
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

async function showPickupDetails(bookingId) {
  try {
    const res = await nativeFetch(`${API_BASE}/bookings/${bookingId}`, { headers: authHeaders() });
    const data = await res.json();
    if (!res.ok || !data?.data) return true;
    const b = data.data;
    const addOns = bookingAddOnNames(b);
    const content = `
      <div class="summary-box" style="border-top:0;margin-top:0">
        <div><span>Customer</span><b>${escapeHtml(b.customerId?.name || '—')}</b></div>
        <div><span>Email</span><b>${escapeHtml(b.customerId?.email || '—')}</b></div>
        <div><span>Vehicle</span><b>${escapeHtml(b.vehicleId?.name || '—')}</b></div>
        <div><span>Pickup</span><b>${escapeHtml(new Date(b.startDate).toLocaleString('en-IN'))}</b></div>
        <div><span>Return</span><b>${escapeHtml(new Date(b.endDate).toLocaleString('en-IN'))}</b></div>
        <div><span>Selected add-ons</span><b>${addOns.length ? escapeHtml(addOns.join(', ')) : 'None selected'}</b></div>
      </div>
      <p class="muted" style="margin:4px 0 0">Record the pickup odometer and fuel level, then complete the pickup.</p>`;
    return await new Promise(resolve => {
      showInfoModal({
        title: 'Pickup checklist',
        kicker: 'BEFORE HANDOVER',
        content,
        confirmText: 'Complete pickup',
        id: 'vrm-pickup-modal'
      });
      const modal = document.getElementById('vrm-pickup-modal');
      const confirm = modal?.querySelector('[data-close]');
      if (!confirm) return resolve(true);
      confirm.onclick = () => { closeOverlay('vrm-pickup-modal'); resolve(true); };
    });
  } catch {
    return true;
  }
}

window.fetch = wrappedFetch;

const observer = new MutationObserver(() => {
  fixUploadedImageSources();
  applyAddonPresentation();
  applyCustomerBillButtons();
});
observer.observe(document.documentElement, { childList: true, subtree: true });

setTimeout(() => {
  fixUploadedImageSources();
  applyAddonPresentation();
  applyCustomerBillButtons();
}, 500);
