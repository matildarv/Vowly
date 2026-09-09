// Supabase data access layer for Vow & Co.
//
// This is the only file that knows the shape of the Postgres tables in
// supabase/schema.sql. Everything else in the app — wedding-data.js's
// mutators, dashboard.js's render functions — keeps working against the
// existing local VOWDATA shape; this file translates between the two
// directions:
//
//   DB row  -> local shape   (used when hydrating the dashboard on load)
//   local shape -> DB row    (used when a mutation needs to be pushed up)
//
// wedding-data.js calls into window.VOWREMOTE.syncXyz(weddingId, payload)
// after every local mutation (see remoteSync() there); this file is what
// those calls actually do. Nothing here is called unless a couple is signed
// in and VOWDATA.enableRemoteSync(weddingId) has been switched on — see
// dashboard.js's bootstrap.

(function () {
  async function client() {
    if (window.VOWSUPA && window.VOWSUPA.ready) await window.VOWSUPA.ready;
    const c = window.VOWSUPA && window.VOWSUPA.client;
    if (!c) throw new Error("Supabase isn't configured — copy .env.example to .env and fill in your project URL and publishable key.");
    return c;
  }

  function unwrap(result) {
    if (result.error) throw result.error;
    return result.data;
  }

  // ---------------------------------------------------------------------
  // Mappers — wedding
  // ---------------------------------------------------------------------
  function weddingRowToLocal(row) {
    if (!row) return null;
    const extra = row.extra || {};
    return {
      id: row.id,
      name: row.partner_one_name || '',
      partner: row.partner_two_name || '',
      date: row.wedding_date || '',
      location: row.location || '',
      guests: row.guest_count != null ? Number(row.guest_count) : 0,
      budget: row.budget != null ? Number(row.budget) : 0,
      style: row.style || '',
      ceremonyType: row.ceremony_type || '',
      receptionType: row.reception_type || '',
      dressCode: extra.dressCode || '',
      alreadyBooked: extra.alreadyBooked || [],
      needHelpWith: extra.needHelpWith || [],
      priorities: extra.priorities || ''
    };
  }

  function weddingLocalToRow(w) {
    return {
      partner_one_name: w.name || null,
      partner_two_name: w.partner || null,
      wedding_date: w.date || null,
      location: w.location || null,
      guest_count: w.guests != null && w.guests !== '' ? Number(w.guests) : null,
      budget: w.budget != null && w.budget !== '' ? Number(w.budget) : null,
      style: w.style || null,
      ceremony_type: w.ceremonyType || null,
      reception_type: w.receptionType || null,
      extra: {
        dressCode: w.dressCode || '',
        alreadyBooked: w.alreadyBooked || [],
        needHelpWith: w.needHelpWith || [],
        priorities: w.priorities || ''
      }
    };
  }

  // ---------------------------------------------------------------------
  // Mappers — guests
  // ---------------------------------------------------------------------
  const RSVP_LOCAL_TO_DB = { Awaiting: 'pending', Yes: 'attending', No: 'declined' };
  const RSVP_DB_TO_LOCAL = { pending: 'Awaiting', invited: 'Awaiting', attending: 'Yes', declined: 'No' };

  function guestRowToLocal(row) {
    const extra = row.extra || {};
    return {
      id: row.id,
      firstName: row.first_name || '',
      lastName: row.last_name || '',
      displayName: ((row.first_name || '') + ' ' + (row.last_name || '')).trim() || 'Guest',
      email: row.email || '',
      phone: row.phone || '',
      rsvp: RSVP_DB_TO_LOCAL[row.rsvp_status] || 'Awaiting',
      guestType: row.guest_type === 'plus_one' ? 'plus-one' : 'guest',
      invited: extra.invited !== undefined ? !!extra.invited : true,
      plusOneAllowed: !!row.plus_one_allowed,
      plusOneConfirmed: extra.plusOneConfirmed !== undefined ? !!extra.plusOneConfirmed : !!row.plus_one_name,
      plusOneName: row.plus_one_name || '',
      plusOneRelationship: extra.plusOneRelationship || '',
      plusOneGuestId: extra.plusOneGuestId || null,
      linkedToGuestId: extra.linkedToGuestId || null,
      dietaryRequirement: row.dietary_requirement || 'None',
      dietaryNotes: extra.dietaryNotes || '',
      tableId: row.table_id || null,
      tableSeat: row.seat_number != null ? row.seat_number : null,
      lastTableId: extra.lastTableId || null,
      relationshipGroup: row.relationship_group || '',
      sideOfCouple: row.side_of_couple || '',
      notes: row.notes || '',
      isChild: row.guest_type === 'child',
      accessibilityNotes: extra.accessibilityNotes || '',
      invitationSent: !!extra.invitationSent,
      invitationDate: extra.invitationDate || '',
      rsvpDate: extra.rsvpDate || ''
    };
  }

  function guestLocalToRow(weddingId, g) {
    return {
      id: g.id,
      wedding_id: weddingId,
      first_name: g.firstName || null,
      last_name: g.lastName || null,
      email: g.email || null,
      phone: g.phone || null,
      rsvp_status: RSVP_LOCAL_TO_DB[g.rsvp] || 'pending',
      guest_type: g.isChild ? 'child' : (g.guestType === 'plus-one' ? 'plus_one' : 'guest'),
      plus_one_allowed: !!g.plusOneAllowed,
      plus_one_name: g.plusOneName || null,
      dietary_requirement: g.dietaryRequirement || null,
      relationship_group: g.relationshipGroup || null,
      side_of_couple: g.sideOfCouple || null,
      table_id: g.tableId || null,
      seat_number: g.tableSeat != null && g.tableSeat !== '' ? Number(g.tableSeat) : null,
      notes: g.notes || null,
      extra: {
        invited: g.invited,
        plusOneConfirmed: g.plusOneConfirmed,
        plusOneRelationship: g.plusOneRelationship,
        plusOneGuestId: g.plusOneGuestId,
        linkedToGuestId: g.linkedToGuestId,
        dietaryNotes: g.dietaryNotes,
        lastTableId: g.lastTableId,
        accessibilityNotes: g.accessibilityNotes,
        invitationSent: g.invitationSent,
        invitationDate: g.invitationDate,
        rsvpDate: g.rsvpDate
      }
    };
  }

  // ---------------------------------------------------------------------
  // Mappers — tables, tasks, appointments, budget items
  // ---------------------------------------------------------------------
  function tableRowToLocal(row) {
    return { id: row.id, name: row.name || '', seats: row.capacity != null ? Number(row.capacity) : 8, shape: row.shape || 'Round', notes: row.notes || '' };
  }
  function tableLocalToRow(weddingId, t) {
    return { id: t.id, wedding_id: weddingId, name: t.name || null, capacity: t.seats != null && t.seats !== '' ? Number(t.seats) : null, shape: t.shape || 'Round', notes: t.notes || null };
  }

  function taskRowToLocal(row) {
    return { id: row.id, title: row.title || '', category: row.category || 'Other', dueDate: row.due_date || '', priority: row.priority || 'medium', completed: !!row.completed };
  }
  function taskLocalToRow(weddingId, t) {
    return { id: t.id, wedding_id: weddingId, title: t.title || '(untitled task)', category: t.category || null, due_date: t.dueDate || null, priority: t.priority || 'medium', completed: !!t.completed };
  }

  function appointmentRowToLocal(row) {
    return { id: row.id, date: row.date || '', time: row.time || '', vendorName: row.vendor_name || '', notes: row.notes || '' };
  }
  function appointmentLocalToRow(weddingId, a) {
    return { id: a.id, wedding_id: weddingId, title: a.vendorName || null, vendor_name: a.vendorName || null, date: a.date || null, time: a.time || null, notes: a.notes || null };
  }

  function budgetItemRowToLocal(row) {
    return {
      id: row.id,
      category: row.category || 'Other',
      vendorName: row.vendor_name || '',
      description: row.description || '',
      amount: row.committed_amount != null ? Number(row.committed_amount) : 0,
      paidAmount: row.paid_amount != null ? Number(row.paid_amount) : 0,
      dueDate: row.due_date || '',
      linkedVendorId: null
    };
  }
  function budgetItemLocalToRow(weddingId, b) {
    const amount = Number(b.amount) || 0;
    const paid = Number(b.paidAmount) || 0;
    let status = 'estimated';
    if (amount > 0 && paid >= amount) status = 'paid';
    else if (b.linkedVendorId) status = 'booked';
    else if (amount > 0) status = 'quoted';
    return {
      id: b.id,
      wedding_id: weddingId,
      category: b.category || null,
      name: b.description || b.vendorName || b.category || 'Budget item',
      description: b.description || null,
      vendor_name: b.vendorName || null,
      estimated_amount: amount,
      quoted_amount: amount,
      committed_amount: amount,
      paid_amount: paid,
      due_date: b.dueDate || null,
      status: status
    };
  }

  // ---------------------------------------------------------------------
  // Wedding-level operations
  // ---------------------------------------------------------------------
  async function getWeddingForProfile(profileId) {
    const c = await client();
    const result = await c.from('weddings').select('*').eq('couple_id', profileId).order('created_at', { ascending: false }).limit(1).maybeSingle();
    return weddingRowToLocal(unwrap(result));
  }

  async function createWedding(profileId, localWedding) {
    const c = await client();
    const row = weddingLocalToRow(localWedding);
    row.couple_id = profileId;
    const result = await c.from('weddings').insert(row).select().single();
    const created = unwrap(result);
    // wedding_settings row, default AUD — see schema.sql. Best-effort: a
    // failure here shouldn't block the couple from reaching their dashboard.
    try { await c.from('wedding_settings').insert({ wedding_id: created.id, currency: 'AUD' }); } catch (e) { /* non-fatal */ }
    return weddingRowToLocal(created);
  }

  async function fetchFullWedding(weddingId) {
    const c = await client();
    const [weddingRes, guestsRes, tablesRes, tasksRes, apptsRes, budgetRes] = await Promise.all([
      c.from('weddings').select('*').eq('id', weddingId).single(),
      c.from('guests').select('*').eq('wedding_id', weddingId),
      c.from('tables').select('*').eq('wedding_id', weddingId),
      c.from('tasks').select('*').eq('wedding_id', weddingId),
      c.from('appointments').select('*').eq('wedding_id', weddingId),
      c.from('budget_items').select('*').eq('wedding_id', weddingId)
    ]);
    return {
      wedding: weddingRowToLocal(unwrap(weddingRes)),
      guests: (unwrap(guestsRes) || []).map(guestRowToLocal),
      tables: (unwrap(tablesRes) || []).map(tableRowToLocal),
      tasks: (unwrap(tasksRes) || []).map(taskRowToLocal),
      appointments: (unwrap(apptsRes) || []).map(appointmentRowToLocal),
      budgetItems: (unwrap(budgetRes) || []).map(budgetItemRowToLocal)
    };
  }

  // ---------------------------------------------------------------------
  // Sync — called by wedding-data.js's remoteSync() after every mutation.
  // All are fire-and-forget from the caller's point of view; errors are
  // thrown so wedding-data.js's catch() can log them.
  // ---------------------------------------------------------------------
  async function syncWeddingUpdate(weddingId, localWedding) {
    const c = await client();
    unwrap(await c.from('weddings').update(weddingLocalToRow(localWedding)).eq('id', weddingId));
  }

  // Upserts every row currently in `rows`, then deletes any remote row for
  // this wedding whose id is no longer present locally — the simplest
  // correct way to keep a whole list (guests, tables, tasks) in sync when a
  // single UI action can add, edit, *and* remove records in one go (e.g. a
  // plus-one being materialised or removed alongside its primary guest).
  async function bulkReplace(c, table, weddingId, localRows, mapper) {
    const rows = localRows.map(function (r) { return mapper(weddingId, r); });
    if (rows.length) unwrap(await c.from(table).upsert(rows));
    const keepIds = localRows.map(function (r) { return r.id; });
    let del = c.from(table).delete().eq('wedding_id', weddingId);
    if (keepIds.length) del = del.not('id', 'in', '(' + keepIds.join(',') + ')');
    unwrap(await del);
  }

  async function syncGuestsBulkReplace(weddingId, localGuests) {
    const c = await client();
    await bulkReplace(c, 'guests', weddingId, localGuests, guestLocalToRow);
  }

  async function syncTablesBulkReplace(weddingId, localTables) {
    const c = await client();
    await bulkReplace(c, 'tables', weddingId, localTables, tableLocalToRow);
  }

  async function syncTasksBulkReplace(weddingId, localTasks) {
    const c = await client();
    await bulkReplace(c, 'tasks', weddingId, localTasks, taskLocalToRow);
  }

  async function syncTaskUpsert(weddingId, localTask) {
    const c = await client();
    unwrap(await c.from('tasks').upsert(taskLocalToRow(weddingId, localTask)));
  }
  async function syncTaskDelete(weddingId, id) {
    const c = await client();
    unwrap(await c.from('tasks').delete().eq('id', id).eq('wedding_id', weddingId));
  }

  async function syncAppointmentUpsert(weddingId, localAppt) {
    const c = await client();
    unwrap(await c.from('appointments').upsert(appointmentLocalToRow(weddingId, localAppt)));
  }
  async function syncAppointmentDelete(weddingId, id) {
    const c = await client();
    unwrap(await c.from('appointments').delete().eq('id', id).eq('wedding_id', weddingId));
  }

  async function syncBudgetItemUpsert(weddingId, localItem) {
    const c = await client();
    unwrap(await c.from('budget_items').upsert(budgetItemLocalToRow(weddingId, localItem)));
  }
  async function syncBudgetItemDelete(weddingId, id) {
    const c = await client();
    unwrap(await c.from('budget_items').delete().eq('id', id).eq('wedding_id', weddingId));
  }

  window.VOWREMOTE = {
    getWeddingForProfile: getWeddingForProfile,
    createWedding: createWedding,
    fetchFullWedding: fetchFullWedding,
    syncWeddingUpdate: syncWeddingUpdate,
    syncGuestsBulkReplace: syncGuestsBulkReplace,
    syncTablesBulkReplace: syncTablesBulkReplace,
    syncTasksBulkReplace: syncTasksBulkReplace,
    syncTaskUpsert: syncTaskUpsert,
    syncTaskDelete: syncTaskDelete,
    syncAppointmentUpsert: syncAppointmentUpsert,
    syncAppointmentDelete: syncAppointmentDelete,
    syncBudgetItemUpsert: syncBudgetItemUpsert,
    syncBudgetItemDelete: syncBudgetItemDelete
  };
})();
