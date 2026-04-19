/**
 * Verify the SFDC adapter seam: setting RI_SFDC_IMPL=real makes every sObject
 * method throw a 501 "not implemented" — the platform never crashes, just
 * surfaces a clear error.
 */
process.env.RI_SFDC_IMPL = 'real';
delete require.cache[require.resolve('../../server/sfdc')];

const { getAdapter } = require('../../server/sfdc');
const adapter = getAdapter();

const METHODS = ['listAccounts', 'getAccount', 'createAccount', 'updateAccount', 'listOpps', 'getOpp', 'createOpp', 'updateOpp', 'listContacts'];

(async () => {
  let failed = 0;
  for (const m of METHODS) {
    if (typeof adapter[m] !== 'function') {
      console.error('FAIL ' + m + ' missing from real-adapter stub');
      failed += 1;
      continue;
    }
    try {
      await adapter[m]({ sf_id: 'x', sf_account_id: 'x' });
      console.error('FAIL ' + m + ' should have thrown');
      failed += 1;
    } catch (e) {
      if (e.statusCode === 501 && /not implemented/i.test(e.message)) {
        console.log('ok   ' + m + ' → 501 not implemented');
      } else {
        console.error('FAIL ' + m + ' wrong error: ' + e.statusCode + ' ' + e.message);
        failed += 1;
      }
    }
  }
  console.log('\n' + (METHODS.length - failed) + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})();
