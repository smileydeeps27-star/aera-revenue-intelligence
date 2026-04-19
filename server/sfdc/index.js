/**
 * ISfdcAdapter — the interface every adapter (mock now, real later) must implement.
 * The platform depends only on this contract.
 */
const MockAdapter = require('./mock');

function getAdapter() {
  const impl = process.env.RI_SFDC_IMPL || 'mock';
  if (impl === 'mock') return MockAdapter;
  // Placeholder for future real adapter
  return {
    listAccounts: async () => { const e = new Error('Real SFDC adapter not implemented'); e.statusCode = 501; throw e; },
    getAccount: async () => { const e = new Error('Real SFDC adapter not implemented'); e.statusCode = 501; throw e; },
    createAccount: async () => { const e = new Error('Real SFDC adapter not implemented'); e.statusCode = 501; throw e; },
    updateAccount: async () => { const e = new Error('Real SFDC adapter not implemented'); e.statusCode = 501; throw e; },
    listOpps: async () => { const e = new Error('Real SFDC adapter not implemented'); e.statusCode = 501; throw e; },
    getOpp: async () => { const e = new Error('Real SFDC adapter not implemented'); e.statusCode = 501; throw e; },
    createOpp: async () => { const e = new Error('Real SFDC adapter not implemented'); e.statusCode = 501; throw e; },
    updateOpp: async () => { const e = new Error('Real SFDC adapter not implemented'); e.statusCode = 501; throw e; },
    listContacts: async () => { const e = new Error('Real SFDC adapter not implemented'); e.statusCode = 501; throw e; }
  };
}

module.exports = { getAdapter };
