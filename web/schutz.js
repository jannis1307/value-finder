/* Schutz gegen Einbetten (Clickjacking): Eine fremde Seite könnte die App unsichtbar einbetten und dich
   auf Knöpfe wie „Entfernen“ oder „Schlüssel kopieren“ tippen lassen. Eingebettet zeigt sich die App nicht. */
(function(){
  var gerahmt = false;
  try { gerahmt = window.top !== window.self; } catch (e) { gerahmt = true; }
  if (gerahmt) {
    document.documentElement.style.display = "none";
    try { window.top.location = window.location.href; } catch (e) {}
  }
})();
