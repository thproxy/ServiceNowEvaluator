# ServiceNowEvaluator

This package allows you to run ServiceNow code from outside of the platform similar
to running background scripts which will allow you to easily integrate other services
with it.

## Example

```javascript
const Evaluator = require('servicenow-evaluator');

(async () => {
  const e = new Evaluator('https://your-instance.service-now.com');
  await e.login('username', 'password');
  const result = await e.evaluate(function () {
    // must use es5 code or whatever servicenow supports
    var gr = new GlideRecord('sys_user');
    gr.query();
    gr.next();
    return {
      id: gr.getValue('sys_id'),
      name: gr.getValue('name'),
    };
  });
  console.log(result);
})();
```
