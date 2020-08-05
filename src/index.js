const fetch = require('node-fetch');

class CookieJar {
  constructor() {
    this.cookies = {};
    this.updateCookies = this.updateCookies.bind(this);
    this.setCookie = this.setCookie.bind(this);
    this.toString = this.toString.bind(this);
    this.valueOf = this.valueOf.bind(this);
  }

  updateCookies(res) {
    if (res.headers.raw()['set-cookie']) {
      res.headers.raw()['set-cookie'].forEach((cookie) => {
        this.setCookie(...cookie.split(';')[0].split('='));
      });
    }
    return res;
  }

  setCookie(k, v) {
    this.cookies[k] = v;
  }

  toString() {
    return Object.entries(this.cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join(';');
  }

  valueOf() {
    return this.toString();
  }
}

module.exports = class {
  constructor(instance) {
    this.cookies = new CookieJar();
    this.instance = instance;
    this.connected = false;
    this.csrf = null;
  }

  static extractResult(resText) {
    const output = resText.match(/<PRE>\*\*\* Script: ((?:.|\n)*?)<BR\/>/);
    // todo: fill this table out
    const htmlEntities = {
      '&amp;': '&',
      '&lt;': '<',
      '&gt;': '>',
      '&quot;': '"',
      '&apos;': "'",
    };
    return {
      text: resText,
      output: output && output[1].replace(new RegExp(Object.keys(htmlEntities).join('|'), 'g'), (match) => htmlEntities[match]),
    };
  }

  static infoifyFn(fn, args, fnArgs) {
    return `${fnArgs.map(String).join(';')};var result = (${fn})(${JSON.stringify(args).slice(1, -1)}); var output = result instanceof Object ? JSON.stringify(result) : result; gs.info(output)`;
  }

  fetch(url, opts = {}) {
    if (!opts.headers) opts.headers = {};
    opts.headers.cookie = this.cookies;

    if (opts.method && opts.method !== 'GET' && this.csrf) {
      // it's fine to add the random null even if csrf isn't enabled
      opts.body.append('sysparm_ck', this.csrf);
      opts.headers['x-usertoken'] = this.csrf;

      return fetch(url, opts)
        .then(this.cookies.updateCookies);
    }
    return fetch(url, opts)
      .then(this.cookies.updateCookies);
  }

  login(username, password) {
    return this.fetch(`${this.instance}/login.do`, {
      method: 'POST',
      redirect: 'manual',
      body: new URLSearchParams({
        user_name: username,
        user_password: password,
        sys_action: 'sysverb_login',
      }),
    })
      .then((res) => {
        if (!res.headers.get('location')) {
          throw new Error('Failed to login.');
        }
        return this.fetch(res.headers.get('location'));
      })
      .then((res) => {
        if (res.headers.get('x-is-logged-in') !== 'true') {
          throw new Error('Failed to login.');
        }
        this.connected = true;

        // pick up the csrf token from the page if it exists
        return res.text()
          .then((text) => text.match(/var g_ck = '(.*?)'/)[1])
          .catch(() => { this.csrf = null; })
          .then((csrfToken) => { this.csrf = csrfToken; });
      });
  }

  evaluate(fn, { scope = 'global', args = [], fnArgs = [] } = {}) {
    if (!this.connected) {
      throw new Error('Cannot evaluate without logging in first.');
    }
    return this.fetch(`${this.instance}/sys.scripts.do`, {
      method: 'POST',
      body: new URLSearchParams({
        script: this.constructor.infoifyFn(fn, args, fnArgs),
        runscript: 'Run Script',
        sys_scope: scope,
      }),
    })
      .then(this.cookies.updateCookies)
      .then((res) => res.text())
      .then((text) => this.constructor.extractResult(text));
  }
};
