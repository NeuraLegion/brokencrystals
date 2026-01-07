import { SecRunner } from '@sectester/runner';

describe('/api', () => {
  const timeout = 600000;
  jest.setTimeout(timeout);

  let runner: SecRunner;

  beforeEach(async () => {
    runner = new SecRunner({ hostname: process.env.BRIGHT_CLUSTER });
    await runner.init();
  });

  afterEach(() => runner.clear());

  describe('POST /mcp', () => {
    describe('count_tool', () => {
      it('should not execute commands for SQL database via MCP count_tool', async () => {
        await runner
          .createScan({
            tests: ['sqli'],
            name: expect.getState().currentTestName
          })
          .timeout(timeout)
          .run({
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              jsonrpc: '2.0',
              method: 'tools/call',
              params: {
                name: 'count_tool',
                arguments: {
                  query: 'select count(*) as count from testimonial'
                }
              },
              id: 1
            }),
            url: `${process.env.SEC_TESTER_TARGET}/api/mcp`
          });
      });
    });

    describe('config_tool', () => {
      it('should not contain secret tokens leak via MCP config_tool', async () => {
        await runner
          .createScan({
            tests: ['secret_tokens'],
            name: expect.getState().currentTestName
          })
          .timeout(timeout)
          .run({
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              jsonrpc: '2.0',
              method: 'tools/call',
              params: {
                name: 'config_tool',
                arguments: {}
              },
              id: 1
            }),
            url: `${process.env.SEC_TESTER_TARGET}/api/mcp`
          });
      });
    });

    describe('render_tool', () => {
      it('should not contain possibility to server-side code execution via MCP render_tool', async () => {
        await runner
          .createScan({
            tests: ['ssti'],
            name: expect.getState().currentTestName
          })
          .timeout(timeout)
          .run({
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              jsonrpc: '2.0',
              method: 'tools/call',
              params: {
                name: 'render_tool',
                arguments: {
                  numbers: [1, 2, 3],
                  template: 'Result: {{=it.sum}}'
                }
              },
              id: 1
            }),
            url: `${process.env.SEC_TESTER_TARGET}/api/mcp`
          });
      });
    });
  });
});
