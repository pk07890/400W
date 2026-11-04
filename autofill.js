/*
 * 外銷鋼筋物料請購 → 物料管理系統 自動開單（書籤小工具載入的程式）
 * 用法：在 400W 頁面按「開立請購單 → ⚡ 自動開單」打開物料管理系統的需求單頁（網址 #tw400w=… 帶著請購資料），
 *       再按我的最愛列上的「⚡ 自動開單」書籤：自動按「新增」、填備註(給主管)、把每一項加進明細表（料號、需求量，
 *       品名／規格／單位／庫存由物料系統自己的資料帶出）。最後由使用者確認後按「存檔並開立請購單」才會送出。
 * 只在 mmu.tunghosteel.com 的「需求單開立與維護作業」頁執行；不會自動存檔。
 */
(function () {
  'use strict';
  var PANEL_ID = 'tw400wPanel';
  var $ = window.jQuery;

  function fail(msg) { alert('自動開單：' + msg); }
  if (!/mmu\.tunghosteel\.com/i.test(location.host) || !/Requirement\/CreateRequirement/i.test(location.pathname)) {
    return fail('請在物料管理系統的「需求單開立與維護作業」頁面使用（從 400W 按「⚡ 自動開單」打開的那一頁）。');
  }
  if (!$ || !$.CommonBase || !$('#detailGrid').data('kendoGrid')) return fail('頁面還沒載入完成，請稍等幾秒再按一次。');

  var m = /[#&]tw400w=([^&]+)/.exec(location.hash);
  if (!m) return fail('網址裡沒有請購資料。請從 400W 頁面按「開立請購單 → ⚡ 自動開單」打開這一頁。');
  var order;
  try { order = JSON.parse(decodeURIComponent(m[1])); } catch (e) { return fail('請購資料讀不懂：' + e.message); }
  if (!order || !order.items || !order.items.length) return fail('請購資料是空的。');

  var old = document.getElementById(PANEL_ID);
  if (old) old.remove();

  // ── 右上角小視窗 ──
  var panel = document.createElement('div');
  panel.id = PANEL_ID;
  panel.style.cssText = 'position:fixed;top:12px;right:12px;z-index:99999;width:420px;max-height:90vh;overflow:auto;background:#fff;' +
    'border:2px solid #E3001B;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.25);font:13px/1.5 "Microsoft JhengHei",sans-serif;color:#1a1a1a;padding:12px 14px;';
  document.body.appendChild(panel);
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function render(html) { panel.innerHTML = '<div style="font-weight:700;font-size:15px;color:#E3001B;margin-bottom:6px">⚡ 外銷鋼筋 自動開單</div>' + html; }
  function btn(id, text, primary) {
    return '<button id="' + id + '" style="margin:4px 6px 0 0;padding:6px 12px;border-radius:4px;cursor:pointer;font-weight:600;' +
      (primary ? 'background:#E3001B;color:#fff;border:1px solid #E3001B' : 'background:#fff;color:#E3001B;border:1px solid #E3001B') + '">' + text + '</button>';
  }

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

  // 使用者 2026-11-04：「我點自動開立就直接開就好」——按書籤就自動填好並送出，不用再按確認。
  // 保護：①有料號找不到或單位對不上就不送出，停下來讓人處理 ②同一張請購資料開過就不再開（防重新整理、重按）
  // order.test＝true 時只填不送（測試用）
  var orderKey = 'tw400w_done_' + (function (s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; })(m[1]);
  var doneBefore = null;
  try { doneBefore = JSON.parse(localStorage.getItem(orderKey) || 'null'); } catch (e) { doneBefore = null; }
  if (doneBefore) {
    render('<div style="color:#2E7D32;font-weight:700">這張請購資料已經開過了：需求單 ' + esc(doneBefore.no) + '</div>' +
      '<div style="color:#666">' + esc(doneBefore.at) + ' 開立，不會再開一次。要重開請回 400W 重新按「⚡ 自動開單」。</div>' +
      '<div style="margin-top:8px">' + btn('tw400wXls', '⇩ 再下載一次備存', true) + btn('tw400wClose', '關閉') + '</div>');
    document.getElementById('tw400wClose').onclick = function () { panel.remove(); };
    document.getElementById('tw400wXls').onclick = function () { download(doneBefore.no); };
    return;
  }
  if (missing.length || unitBad.length) {
    render('<div style="color:#C00000;font-weight:700">有問題，沒有送出：</div>' +
      (missing.length ? '<div style="color:#C00000">‧ ' + missing.length + ' 項在物料系統找不到料號</div>' : '') +
      (unitBad.length ? '<div style="color:#C00000">‧ ' + unitBad.length + ' 項單位跟 400W 寫的不同</div>' : '') +
      listHtml(false) + '<div style="color:#666;margin-top:6px">請修正 400W 的料號／單位後重新按「⚡ 自動開單」。</div>' +
      '<div style="margin-top:8px">' + btn('tw400wClose', '關閉') + '</div>');
    document.getElementById('tw400wClose').onclick = function () { panel.remove(); };
    return;
  }
  fill();

  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function pageButton(text) { return $('button').filter(function () { return $(this).text().trim() === text; }).filter(':visible').first(); }

  async function fill() {
    render('填入中…');
    // 1. 按「新增」進入新增模式（已經是新增模式且明細是空的就不用按）
    var mode = $('body').text().indexOf('模式：新增') >= 0;
    var grid = $('#detailGrid').data('kendoGrid');
    if (!mode || grid.dataSource.data().length) {
      var addBtn = pageButton('新增');
      if (!addBtn.length) return render('<div style="color:#C00000">找不到「新增」按鈕，請先回到需求單查詢畫面再試一次。</div>');
      addBtn.click();
      await wait(1200);
      grid = $('#detailGrid').data('kendoGrid');
    }
    // 2. 備註(給主管)
    $('#Remark').val(order.remark || '').trigger('change');
    // 3. 明細：照物料系統選料號時的做法帶出品名、規格、單位
    var ds = grid.dataSource;
    var ok = lines.filter(function (l) { return l.mat; });
    ok.forEach(function (l) {
      var row = ds.add({
        MaterialNo: l.mat.MaterialNo, MaterialUid: l.mat.MaterialUid, MaterialName: l.mat.MaterialName,
        SpecDesp1: l.mat.SpecDesp1, SpecDesp2: l.mat.SpecDesp2,
        UnitMeasureCode: l.mat.UnitMeasureCode, UnitMeasureName: l.mat.UnitMeasureName,
        CurrentStock: 0, Quantity: Number(l.it.qty), Brand: '', Remark: ''
      });
      if (!row.RequiredDate && $.ToolsBase && $.ToolsBase.TodayAddDay) row.set('RequiredDate', $.ToolsBase.TodayAddDay(30));
      l.row = row;
    });
    // 4. 庫存量
    try {
      var stock = await $.CommonBase.GetStockInfoList($('#LocationId').val(), ok.map(function (l) { return l.mat.MaterialNo; }));
      ok.forEach(function (l) {
        var s = (stock || []).find(function (p) { return p.MaterialNo == l.mat.MaterialNo; });
        l.stock = s ? s.StockQty : 0;
        l.row.set('CurrentStock', l.stock);
      });
    } catch (e) { /* 庫存抓不到不影響開單 */ }
    grid.refresh();
    if (order.test) {
      render('<div style="color:#2E7D32;font-weight:600">（測試模式）已填入 ' + ok.length + ' 項，沒有送出。</div>' +
        '<div>備註：' + esc(order.remark) + '</div>' + listHtml(true) + '<div style="margin-top:8px">' + btn('tw400wClose', '關閉') + '</div>');
      document.getElementById('tw400wClose').onclick = function () { panel.remove(); };
      return;
    }
    render('<div>已填入 ' + ok.length + ' 項，送出中…</div>' + listHtml(true));
    await wait(600);
    save();
  }

  // 按物料系統的「存檔並開立請購單」，它跳出的確認視窗（alertify）自動按 OK
  async function save() {
    var b = pageButton('存檔並開立請購單');
    if (!b.length) return render('<div style="color:#C00000">找不到「存檔並開立請購單」按鈕，沒有送出。</div>');
    b.click();
    for (var k = 0; k < 20; k++) {
      await wait(300);
      var okBtn = $('.ajs-ok:visible, .ajs-button:visible').filter(function () { return /^(OK|確定)$/i.test($(this).text().trim()); }).first();
      if (okBtn.length) { okBtn.click(); break; }
    }
    for (var i = 0; i < 60; i++) {
      await wait(1000);
      var no = $('#RequirementNo').val();
      if (no) {
        // 成功訊息（新增成功, 請購單號…）也自動關掉
        $('.ajs-ok:visible').filter(function () { return /^(OK|確定)$/i.test($(this).text().trim()); }).first().click();
        try { localStorage.setItem(orderKey, JSON.stringify({ no: no, at: new Date().toLocaleString('zh-TW', { hour12: false }) })); } catch (e) { /* 略過 */ }
        try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* 略過 */ }
        return done(no, $('#StatusCode').val());
      }
    }
    render('<div style="color:#C00000">60 秒內沒看到需求單號，可能沒有送出成功。請看物料系統畫面上的訊息。</div>' + btn('tw400wClose', '關閉'));
    document.getElementById('tw400wClose').onclick = function () { panel.remove(); };
  }

  function done(no, status) {
    download(no);   // 自動下載備存
    render('<div style="color:#2E7D32;font-weight:700;font-size:14px">開好了：需求單 ' + esc(no) + '</div><div>狀態：' + esc(status || '') + '</div>' +
      '<div style="margin-top:8px">' + btn('tw400wXls', '⇩ 下載備存（外銷鋼筋請購）', true) + btn('tw400wClose', '關閉') + '</div>');
    document.getElementById('tw400wClose').onclick = function () { panel.remove(); };
    document.getElementById('tw400wXls').onclick = function () { download(no); };
  }

  // 備存：欄位同桌面「外銷鋼筋請購.xlsx」（單據編號｜材料編號｜品名｜圖號｜規格｜規格二｜數量｜單位｜單價｜廠商｜請購日期｜用途）
  function download(no) {
    var d = new Date();
    var roc = (d.getFullYear() - 1911) + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + String(d.getDate()).padStart(2, '0');
    var td = 'border:1px solid #000;padding:3px 6px;font-family:Calibri,Arial,sans-serif;font-size:11pt;';
    var head = ['單據編號', '材料編號', '品名', '圖號', '規格', '規格二', '數量', '單位', '單價', '廠商', '請購日期', '用途']
      .map(function (h) { return '<th style="' + td + 'background:#BDD7EE">' + h + '</th>'; }).join('');
    var rows = lines.filter(function (l) { return l.mat; }).map(function (l) {
      return '<tr>' + [no, l.mat.MaterialNo, l.mat.MaterialName, '', l.mat.SpecDesp1, l.mat.SpecDesp2, l.it.qty, l.mat.UnitMeasureName, '', '', roc, order.remark]
        .map(function (v, i) { return '<td style="' + td + (i === 1 || i === 10 ? 'mso-number-format:\\@;' : '') + '">' + esc(v) + '</td>'; }).join('') + '</tr>';
    }).join('');
    var html = '<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8"><!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>' +
      '<x:Name>外銷鋼筋請購</x:Name></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]--></head><body><table>' +
      '<tr>' + head + '</tr>' + rows + '</table></body></html>';
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([html], { type: 'application/vnd.ms-excel' }));
    a.download = '外銷鋼筋請購_' + no + '.xls';
    document.body.appendChild(a); a.click(); a.remove();
  }
})();
