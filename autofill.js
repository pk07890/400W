/*
 * 外銷鋼筋物料請購 → 物料管理系統 自動開單（我的最愛列書籤「⚡ 自動開立」載入的程式）
 * 用法：在 400W 頁面按「開立請購單 → ⚡ 自動開立請購單」（請購資料會複製到剪貼簿，並打開物料管理系統），
 *       在物料管理系統任何一頁按書籤「⚡ 自動開立」：自動打開需求單畫面 → 新增 → 填備註(給主管) → 每一項加進明細
 *       （料號、需求量；品名／規格／單位／庫存由物料系統自己的資料帶出）→ 存檔並開立請購單（確認視窗自動按 OK）
 *       → 顯示需求單號並下載備存「外銷鋼筋請購_單號.xls」。使用者 2026-11-04：「我點自動開立就直接開就好」。
 * 請購資料來源（依序）：網址 #tw400w=…、剪貼簿（TW400W: 開頭）。
 * 物料系統從 GitHub 跳過去常被轉回首頁、網址資料會掉，所以不在需求單頁時，改在畫面上疊一層需求單頁（同網站 iframe）來操作。
 * 保護：①料號找不到或單位對不上就不送 ②同一份資料開過就不再開 ③order.test＝true 只填不送（測試用）。
 */
(async function () {
  'use strict';
  var PANEL_ID = 'tw400wPanel', FRAME_ID = 'tw400wFrame';
  var MARK = 'TW400W:';

  function fail(msg) { alert('自動開立：' + msg); }
  if (!/mmu\.tunghosteel\.com/i.test(location.host)) return fail('請在物料管理系統（mmu.tunghosteel.com）的頁面上按這個書籤。');

  // ── 讀請購資料：網址 → 剪貼簿 ──
  var raw = null;
  var hm = /[#&]tw400w=([^&]+)/.exec(location.hash);
  if (hm) { try { raw = decodeURIComponent(hm[1]); } catch (e) { raw = null; } }
  if (!raw && navigator.clipboard && navigator.clipboard.readText) {
    try {
      var clip = await navigator.clipboard.readText();
      if (clip && clip.indexOf(MARK) === 0) raw = clip.slice(MARK.length);
    } catch (e) { /* 使用者沒允許讀剪貼簿 */ }
  }
  if (!raw) return fail('沒有讀到請購資料。\n請先在 400W 按「開立請購單 → ⚡ 自動開立請購單」，再回到這裡按書籤。\n（Edge 問要不要允許查看剪貼簿時，請按「允許」）');
  var order;
  try { order = JSON.parse(raw); } catch (e) { return fail('請購資料讀不懂：' + e.message); }
  if (!order || !order.items || !order.items.length) return fail('請購資料是空的。');
  if (window.TW400W_TEST) order.test = true;   // 驗證用：先設 window.TW400W_TEST=true 再載入本程式，只填不送

  // ── 右上角小視窗（放在最上層頁面）──
  var old = document.getElementById(PANEL_ID); if (old) old.remove();
  var panel = document.createElement('div');
  panel.id = PANEL_ID;
  panel.style.cssText = 'position:fixed;top:12px;right:12px;z-index:100000;width:430px;max-height:90vh;overflow:auto;background:#fff;' +
    'border:2px solid #E3001B;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.25);font:13px/1.5 "Microsoft JhengHei",sans-serif;color:#1a1a1a;padding:12px 14px;';
  document.body.appendChild(panel);
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function render(html) { panel.innerHTML = '<div style="font-weight:700;font-size:15px;color:#E3001B;margin-bottom:6px">⚡ 外銷鋼筋 自動開立請購單</div>' + html; }
  function btn(id, text, primary) {
    return '<button id="' + id + '" style="margin:4px 6px 0 0;padding:6px 12px;border-radius:4px;cursor:pointer;font-weight:600;' +
      (primary ? 'background:#E3001B;color:#fff;border:1px solid #E3001B' : 'background:#fff;color:#E3001B;border:1px solid #E3001B') + '">' + text + '</button>';
  }
  function closeBtn() { var c = document.getElementById('tw400wClose'); if (c) c.onclick = function () { panel.remove(); }; }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  // ── 同一份資料開過就不再開 ──
  var orderKey = 'tw400w_done_' + (function (s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; })(raw);
  var doneBefore = null;
  try { doneBefore = JSON.parse(localStorage.getItem(orderKey) || 'null'); } catch (e) { doneBefore = null; }
  if (doneBefore && !order.test) {
    render('<div style="color:#2E7D32;font-weight:700">這份請購資料已經開過了：需求單 ' + esc(doneBefore.no) + '</div>' +
      '<div style="color:#666">' + esc(doneBefore.at) + ' 開立，不會再開一次。要重開請回 400W 重新按「⚡ 自動開立請購單」。</div>' +
      '<div style="margin-top:8px">' + btn('tw400wClose', '關閉') + '</div>');
    return closeBtn();
  }

  // ── 找到需求單頁：就在這頁，或在畫面上疊一層需求單頁 ──
  render('準備需求單畫面…');
  var W = window;
  function ready(w) {
    try { return !!(w.jQuery && w.jQuery.CommonBase && (w.jQuery.CommonBase.AllMaterial || []).length && w.jQuery('#detailGrid').data('kendoGrid')); }
    catch (e) { return false; }
  }
  if (!(/Requirement\/CreateRequirement/i.test(location.pathname) && ready(window))) {
    var oldF = document.getElementById(FRAME_ID); if (oldF) oldF.remove();
    var frame = document.createElement('iframe');
    frame.id = FRAME_ID;
    frame.src = '/Requirement/CreateRequirement';
    frame.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;border:0;z-index:99990;background:#fff;';
    document.body.appendChild(frame);
    for (var t = 0; t < 120 && !ready(frame.contentWindow); t++) await wait(500);
    if (!ready(frame.contentWindow)) { render('<div style="color:#C00000">需求單畫面 60 秒內沒有載入完成（可能要重新登入）。</div>' + btn('tw400wClose', '關閉')); return closeBtn(); }
    W = frame.contentWindow;
  }
  var $ = W.jQuery;
  // 物料系統載入完會用淡入動畫顯示內容（.preloadBody → .renderBodyContent）；視窗在背景時動畫可能不跑，直接顯示
  $('.preloadBody').hide();
  $('.renderBodyContent').show();

  // ── 對料號、核對單位 ──
  var all = $.CommonBase.AllMaterial || [];
  var lines = order.items.map(function (it) {
    var mat = all.find(function (p) { return p.MaterialNo == it.no; }) || all.find(function (p) { return p.OldMaterialNo == it.no; });
    var unitOk = !mat || !it.unit || it.unit === mat.UnitMeasureName || it.unit === mat.UnitMeasureCode;
    return { it: it, mat: mat, unitOk: unitOk };
  });
  var missing = lines.filter(function (l) { return !l.mat; });
  var unitBad = lines.filter(function (l) { return l.mat && !l.unitOk; });
  function listHtml(withStock) {
    return '<table style="width:100%;border-collapse:collapse;font-size:12px">' +
      lines.map(function (l, i) {
        var bad = !l.mat || !l.unitOk;
        return '<tr style="border-top:1px solid #eee' + (bad ? ';background:#FDECEC' : '') + '">' +
          '<td style="padding:3px 4px;color:#888">' + (i + 1) + '</td>' +
          '<td style="padding:3px 4px">' + esc(l.mat ? l.mat.MaterialNo : l.it.no) + '<br><b>' + esc(l.mat ? l.mat.MaterialName : l.it.name) + '</b>' +
          (l.mat ? '' : '<br><span style="color:#C00000">物料系統找不到這個料號</span>') +
          (l.mat && !l.unitOk ? '<br><span style="color:#C00000">單位不同：400W 寫「' + esc(l.it.unit) + '」，系統是「' + esc(l.mat.UnitMeasureName) + '」</span>' : '') + '</td>' +
          '<td style="padding:3px 4px;text-align:right;white-space:nowrap"><b style="color:#2E7D32;font-size:14px">' + Number(l.it.qty).toLocaleString() + '</b> ' +
          esc(l.mat ? l.mat.UnitMeasureName : l.it.unit) + (withStock && l.stock != null ? '<br><span style="color:#888">庫存 ' + l.stock + '</span>' : '') + '</td></tr>';
      }).join('') + '</table>';
  }
  if (missing.length || unitBad.length) {
    render('<div style="color:#C00000;font-weight:700">有問題，沒有送出：</div>' +
      (missing.length ? '<div style="color:#C00000">‧ ' + missing.length + ' 項在物料系統找不到料號</div>' : '') +
      (unitBad.length ? '<div style="color:#C00000">‧ ' + unitBad.length + ' 項單位跟 400W 寫的不同</div>' : '') +
      listHtml(false) + '<div style="color:#666;margin-top:6px">請修正 400W 的料號／單位後重新按「⚡ 自動開立請購單」。</div>' +
      '<div style="margin-top:8px">' + btn('tw400wClose', '關閉') + '</div>');
    return closeBtn();
  }

  function pageButton(text) { return $('button').filter(function () { return $(this).text().trim() === text; }).filter(':visible').first(); }

  // ── 填單 ──
  render('填入中…');
  var grid = $('#detailGrid').data('kendoGrid');
  var mode = $(W.document.body).text().indexOf('模式：新增') >= 0;
  if (!mode || grid.dataSource.data().length) {
    var addBtn = pageButton('新增');
    if (!addBtn.length) { render('<div style="color:#C00000">找不到「新增」按鈕，沒有送出。</div>' + btn('tw400wClose', '關閉')); return closeBtn(); }
    addBtn.click();
    await wait(1200);
    grid = $('#detailGrid').data('kendoGrid');
  }
  $('#Remark').val(order.remark || '').trigger('change');
  var ds = grid.dataSource;
  lines.forEach(function (l) {
    var row = ds.add({
      MaterialNo: l.mat.MaterialNo, MaterialUid: l.mat.MaterialUid, MaterialName: l.mat.MaterialName,
      SpecDesp1: l.mat.SpecDesp1, SpecDesp2: l.mat.SpecDesp2,
      UnitMeasureCode: l.mat.UnitMeasureCode, UnitMeasureName: l.mat.UnitMeasureName,
      CurrentStock: 0, Quantity: Number(l.it.qty), Brand: '', Remark: ''
    });
    if (!row.RequiredDate && $.ToolsBase && $.ToolsBase.TodayAddDay) row.set('RequiredDate', $.ToolsBase.TodayAddDay(30));
    l.row = row;
  });
  try {
    var stock = await $.CommonBase.GetStockInfoList($('#LocationId').val(), lines.map(function (l) { return l.mat.MaterialNo; }));
    lines.forEach(function (l) {
      var s = (stock || []).find(function (p) { return p.MaterialNo == l.mat.MaterialNo; });
      l.stock = s ? s.StockQty : 0;
      l.row.set('CurrentStock', l.stock);
    });
  } catch (e) { /* 庫存抓不到不影響開單 */ }
  grid.refresh();
  if (!$.ToolsBase.Validation('masterDiv', grid)) {
    render('<div style="color:#C00000">物料系統檢查沒有通過，沒有送出。請看畫面上紅字的欄位。</div>' + listHtml(true) + btn('tw400wClose', '關閉'));
    return closeBtn();
  }
  if (order.test) {
    render('<div style="color:#2E7D32;font-weight:600">（測試模式）已填入 ' + lines.length + ' 項，沒有送出。</div>' +
      '<div>備註：' + esc(order.remark) + '</div>' + listHtml(true) + '<div style="margin-top:8px">' + btn('tw400wClose', '關閉') + '</div>');
    return closeBtn();
  }

  // ── 送出：按「存檔並開立請購單」，確認視窗自動按 OK ──
  render('<div>已填入 ' + lines.length + ' 項，送出中…</div>' + listHtml(true));
  await wait(600);
  var saveBtn = pageButton('存檔並開立請購單');
  if (!saveBtn.length) { render('<div style="color:#C00000">找不到「存檔並開立請購單」按鈕，沒有送出。</div>' + btn('tw400wClose', '關閉')); return closeBtn(); }
  saveBtn.click();
  function okButton() { return $('.ajs-button:visible').filter(function () { return /^(OK|確定)$/i.test($(this).text().trim()); }).first(); }
  for (var k = 0; k < 20; k++) { await wait(300); var ok = okButton(); if (ok.length) { ok.click(); break; } }
  var no = '';
  for (var i = 0; i < 60 && !no; i++) { await wait(1000); no = $('#RequirementNo').val(); }
  if (!no) { render('<div style="color:#C00000">60 秒內沒看到需求單號，可能沒有送出成功，請看需求單畫面上的訊息。</div>' + btn('tw400wClose', '關閉')); return closeBtn(); }
  await wait(500);
  var okMsg = okButton(); if (okMsg.length) okMsg.click();   // 「新增成功, 請購單號…」也關掉
  try { localStorage.setItem(orderKey, JSON.stringify({ no: no, at: new Date().toLocaleString('zh-TW', { hour12: false }) })); } catch (e) { /* 略過 */ }
  try { if (location.hash) history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* 略過 */ }
  var status = $('#StatusCode').val();
  download(no);
  render('<div style="color:#2E7D32;font-weight:700;font-size:14px">開好了：需求單 ' + esc(no) + '</div><div>狀態：' + esc(status || '') + '</div>' +
    listHtml(true) + '<div style="margin-top:8px">' + btn('tw400wXls', '⇩ 再下載一次備存', true) + btn('tw400wClose', '關閉') + '</div>');
  closeBtn();
  document.getElementById('tw400wXls').onclick = function () { download(no); };

  // 備存：欄位同桌面「外銷鋼筋請購.xlsx」（單據編號｜材料編號｜品名｜圖號｜規格｜規格二｜數量｜單位｜單價｜廠商｜請購日期｜用途）
  function download(reqNo) {
    var d = new Date();
    var roc = (d.getFullYear() - 1911) + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + String(d.getDate()).padStart(2, '0');
    var td = 'border:1px solid #000;padding:3px 6px;font-family:Calibri,Arial,sans-serif;font-size:11pt;';
    var head = ['單據編號', '材料編號', '品名', '圖號', '規格', '規格二', '數量', '單位', '單價', '廠商', '請購日期', '用途']
      .map(function (h) { return '<th style="' + td + 'background:#BDD7EE">' + h + '</th>'; }).join('');
    var rows = lines.map(function (l) {
      return '<tr>' + [reqNo, l.mat.MaterialNo, l.mat.MaterialName, '', l.mat.SpecDesp1, l.mat.SpecDesp2, l.it.qty, l.mat.UnitMeasureName, '', '', roc, order.remark]
        .map(function (v, i) { return '<td style="' + td + (i === 1 || i === 10 ? 'mso-number-format:\\@;' : '') + '">' + esc(v) + '</td>'; }).join('') + '</tr>';
    }).join('');
    var html = '<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8"><!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>' +
      '<x:Name>外銷鋼筋請購</x:Name></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]--></head><body><table>' +
      '<tr>' + head + '</tr>' + rows + '</table></body></html>';
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([html], { type: 'application/vnd.ms-excel' }));
    a.download = '外銷鋼筋請購_' + reqNo + '.xls';
    document.body.appendChild(a); a.click(); a.remove();
  }
})();
