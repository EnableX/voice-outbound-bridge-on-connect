toastr.options = {
  closeButton: true,
  progressBar: true,
  positionClass: 'toast-top-right',
  timeOut: '5000',
  showMethod: 'fadeIn',
  hideMethod: 'fadeOut',
};

document.getElementById('voice_call_form').addEventListener('submit', function (event) {
  event.preventDefault();

  var from = document.getElementById('fromNumber').value.trim();
  var to = document.getElementById('toNumber').value.trim();
  var bridgeTo = document.getElementById('bridgeToNumber').value.trim();
  var msgEl = document.getElementById('message');
  var callBtn = document.getElementById('callBtn');

  if (!from || !to || !bridgeTo) {
    msgEl.textContent = 'All three number fields are required.';
    return;
  }

  msgEl.textContent = '';
  callBtn.disabled = true;
  callBtn.textContent = 'Dialing…';

  var xhttp = new XMLHttpRequest();
  xhttp.onreadystatechange = function () {
    if (this.readyState !== 4) return;

    callBtn.disabled = false;
    callBtn.innerHTML = '<span class="fa fa-phone"></span>&nbsp; Start Call';

    if (this.status === 200) {
      var resp = JSON.parse(this.responseText);
      toastr.success('Call initiated! Voice ID: ' + resp.voice_id);
    } else {
      var err = this.responseText;
      try { err = JSON.parse(err).error || err; } catch (e) {}
      toastr.error('Failed to start call: ' + err);
      msgEl.textContent = 'Error: ' + err;
    }
  };

  xhttp.open('POST', './outbound-call/', true);
  xhttp.setRequestHeader('Content-Type', 'application/json');
  xhttp.send(JSON.stringify({ from: from, to: to, bridge_to: bridgeTo }));
});
