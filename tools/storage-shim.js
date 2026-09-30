(function () {
  var P = "g:" + __GAME_ID__ + ":";
  function wrap(name) {
    var real;
    try { real = window[name]; void real.length; } catch (e) { return; }
    function keys() {
      var out = [];
      for (var i = 0; i < real.length; i++) {
        var k = real.key(i);
        if (k !== null && k.indexOf(P) === 0) out.push(k.slice(P.length));
      }
      return out;
    }
    var api = {
      getItem: function (k) { return real.getItem(P + String(k)); },
      setItem: function (k, v) { real.setItem(P + String(k), String(v)); },
      removeItem: function (k) { real.removeItem(P + String(k)); },
      key: function (i) { var ks = keys(); return i >= 0 && i < ks.length ? ks[i] : null; },
      clear: function () { keys().forEach(function (k) { real.removeItem(P + k); }); }
    };
    var proxy = new Proxy(api, {
      get: function (t, p) {
        if (p === "length") return keys().length;
        if (typeof p === "symbol") return p === Symbol.toStringTag ? "Storage" : undefined;
        if (Object.prototype.hasOwnProperty.call(api, p)) return api[p];
        var v = api.getItem(p);
        return v === null ? undefined : v;
      },
      set: function (t, p, v) { if (typeof p !== "symbol") api.setItem(p, v); return true; },
      has: function (t, p) { return typeof p === "string" && (p in api || api.getItem(p) !== null); },
      deleteProperty: function (t, p) { if (typeof p === "string") api.removeItem(p); return true; },
      ownKeys: function () { return keys(); },
      getOwnPropertyDescriptor: function (t, p) {
        if (typeof p !== "string") return undefined;
        var v = api.getItem(p);
        return v === null ? undefined : { value: v, writable: true, enumerable: true, configurable: true };
      }
    });
    try { Object.defineProperty(window, name, { configurable: true, get: function () { return proxy; } }); } catch (e) {}
  }
  wrap("localStorage");
  wrap("sessionStorage");
})();
