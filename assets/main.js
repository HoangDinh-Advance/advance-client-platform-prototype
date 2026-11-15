/* Khởi động: chạy sau khi mọi view đã đăng ký. */
(function () {
  'use strict';
  var tnc = document.getElementById('tnc');
  tnc.addEventListener('click', function (event) { if (event.target === tnc) tnc.close(); });
  window.App.start();
})();
