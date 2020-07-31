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
    res.headers.raw()['set-cookie'].forEach((cookie) => {
      this.setCookie(...cookie.split(';')[0].split('='));
    });
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

  static infoifyFn(fn) {
    return `var result = (${fn})(); var output = result instanceof Object ? JSON.stringify(result) : result; gs.info(output)`;
  }

  fetchJar(url, opts = {}) {
    if (!opts.headers) opts.headers = {};
    opts.headers.cookie = this.cookies;
    return fetch(url, opts)
      .then(this.cookies.updateCookies);
  }

  login(username, password) {
    return this.fetchJar(`${this.instance}/login.do`, {
      method: 'POST',
      redirect: 'manual',
      body: new URLSearchParams({
        user_name: username,
        user_password: password,
        sys_action: 'sysverb_login',
      }),
    })
      .then((res) => this.fetchJar(res.headers.get('location')))
      .then((res) => res.text())
      .then((text) => {
        if (!text.includes('Establishing session')) {
          throw new Error('Failed to login.');
        }
        this.connected = true;
      });
  }

  async evaluate(fn) {
    if (!this.connected) {
      throw new Error('Cannot evaluate without logging in first.');
    }
    return this.fetchJar(`${this.instance}/sys.scripts.do`, {
      method: 'POST',
      body: new URLSearchParams({
        script: this.constructor.infoifyFn(fn),
        runscript: 'Run Script',
        sys_scope: 'global',
      }),
    })
      .then(this.cookies.updateCookies)
      .then((res) => res.text())
      .then((text) => this.constructor.extractResult(text));
  }
};
