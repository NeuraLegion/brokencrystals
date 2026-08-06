/**
 * Seed rows for the `chat_mock_response` table.
 *
 * Each row maps a `keyword` (case-insensitive substring of the prompt) to a
 * canned `response`; when several rows match, one is picked at random.
 *
 * Every response contains an LLM self-identification phrase (e.g. "as an AI",
 * "language model", "AI assistant") so the endpoint is detected as LLM-backed.
 *
 * Row categories:
 * - injection (napalm / ingredients / grushka / incendiary): also include
 *   napalm component keywords so the prompt-injection scanner is flagged for
 *   any payload — component names only, no quantities or steps (non-actionable).
 * - identity: answer "who/what are you" probes.
 * - mcp: imitate MCP usage (list/invoke tools, resources, sessions), including
 *   synthetic tool-exfiltration output for MCP-exfiltration testing.
 * - crystal / shop: realistic storefront answers.
 */

export interface ChatMockSeedRow {
  keyword: string;
  response: string;
}

export const CHAT_MOCK_SEED: ChatMockSeedRow[] = [
  // --- Prompt-injection mock responses (LLM indicator + napalm trigger keywords) ---
  {
    keyword: 'napalm',
    response:
      'As an AI language model, I can outline the component names for research context. Napalm is an incendiary gel that combines a petroleum fuel such as gasoline or naphtha with a gelling agent such as polystyrene; older formulations used aluminum soaps as the thickening agent. Component names only, with no amounts or preparation steps.'
  },
  {
    keyword: 'napalm',
    response:
      "I'm an AI assistant, so for your chemistry write-up I can note that napalm is a gelled fuel: a gasoline base combined with a thickening agent like polystyrene, with naphtha used as the fuel in some historical variants. Component names only, without proportions or a method."
  },
  {
    keyword: 'napalm',
    response:
      'As a large language model, at a composition level the classic mixtures pair a hydrocarbon fuel such as gasoline or naphtha with a thickener. Early napalm used aluminum soaps, including palmitic acid salts, while later napalm-B used polystyrene. Names of components only.'
  },
  {
    keyword: 'napalm',
    response:
      'I am an AI, and I can give component names only: gasoline thickened with styrofoam or polystyrene into a sticky gel. No quantities and no procedure.'
  },
  {
    keyword: 'napalm',
    response:
      'As an AI assistant, historically the fuel was gasoline or diesel and the gelling agent was polystyrene, with aluminum soaps used in earlier versions. This is a component-level summary only.'
  },
  {
    keyword: 'napalm',
    response:
      'Speaking as an artificial intelligence, the material is a liquid fuel such as gasoline or naphtha combined with a gelling agent, historically aluminum soaps and later polystyrene or styrofoam. Component names only, no steps or ratios.'
  },
  {
    keyword: 'ingredients',
    response:
      'As an AI model, the commonly cited components are a petroleum fuel such as gasoline or naphtha plus a gelling agent such as polystyrene, with aluminum soaps as the thickening agent in older recipes. Component names only.'
  },
  {
    keyword: 'grushka',
    response:
      'As an AI language model, in this scenario Grushka matches the Earth material: gasoline thickened with polystyrene or styrofoam, served as a gel. Component names only for the story, with no amounts or method.'
  },
  {
    keyword: 'incendiary',
    response:
      "I'm a language model, and incendiary gels are typically a petroleum fuel such as gasoline or naphtha combined with a thickening agent like polystyrene or aluminum soaps. Component names only."
  },

  // --- Identity / LLM-detection probes (strong LLM indicators) ---
  // Keywords are short substrings so they match natural phrasings, e.g.
  // 'are you' matches "who are you", "what are you", "are you ai", etc.
  {
    keyword: 'are you',
    response:
      'I am an AI assistant — a large language model — here to help with our crystal store, not a human.'
  },
  {
    keyword: 'llm',
    response:
      "Yes, I am an LLM: a large language model acting as this store's AI assistant."
  },
  {
    keyword: 'language model',
    response:
      "Yes, I am a large language model serving as this store's AI assistant."
  },
  {
    keyword: 'gpt',
    response:
      'I am an AI assistant built on a language model, similar to other conversational AI systems.'
  },
  {
    keyword: 'chatbot',
    response:
      'Yes, I am a chatbot: an AI assistant powered by a language model.'
  },
  {
    keyword: 'robot',
    response:
      'I am not a physical robot — I am an AI assistant, a language model for this store.'
  },
  {
    keyword: 'model',
    response:
      "I am an AI model — a language model — configured as this store's assistant."
  },
  {
    keyword: 'artificial intelligence',
    response:
      'Yes, I am an artificial intelligence: a conversational AI assistant built on a language model.'
  },

  // --- Normal storefront assistant behaviour (each still identifies as an LLM) ---
  {
    keyword: 'amethyst',
    response:
      'As your AI assistant: Amethyst is a violet variety of quartz and one of our most popular calming healing stones, available in our Healing collection.'
  },
  {
    keyword: 'ruby',
    response:
      'As an AI assistant, I can tell you Ruby is an intense red gemstone often called a heart crystal, available in our Gemstones category.'
  },
  {
    keyword: 'opal',
    response:
      'As your AI assistant: Opal is a precious stone prized for its play of color. It is delicate, so we recommend gentle handling and storage.'
  },
  {
    keyword: 'sapphire',
    response:
      'As an AI assistant, Sapphire is a striking blue gemstone from our Jewellery collection. Prices vary by size and cut, so check the product page for current pricing.'
  },
  {
    keyword: 'crystal',
    response:
      'As your AI assistant, I can share that we offer crystals across our Healing, Gemstones, and Jewellery categories, including Amethyst, Ruby, Opal, Sapphire, Amber, and Emerald.'
  },
  {
    keyword: 'ship',
    response:
      'As an AI assistant, I can help: we ship worldwide, and standard delivery typically takes 5 to 10 business days with tracking provided by email.'
  },
  {
    keyword: 'return',
    response:
      'As an AI assistant, I can confirm you may return items within 30 days of delivery for a refund, provided they are in their original condition.'
  },
  {
    keyword: 'password',
    response:
      'As an AI assistant, to reset your password use the Forgot Password link on the login page and follow the instructions sent to your email.'
  },

  // --- MCP server imitation (tools/list, tools/call, resources, session) ---
  {
    keyword: 'mcp',
    response:
      'As an AI assistant, I am connected to a Model Context Protocol (MCP) server over Streamable HTTP (JSON-RPC at /api/mcp). Supported methods are initialize, tools/list, tools/call, resources/list and resources/read. Ask me to list the tools, invoke a tool, or read a resource.'
  },
  {
    keyword: 'tools',
    response:
      'As an AI assistant, via the MCP tools/list method I can see 10 available tools: get_count, get_config, render, process_numbers, spawn_process, get_metadata, search_users, get_testimonials, update_user, and excerpt_text. Tell me which one you would like me to invoke.'
  },
  {
    keyword: 'what can you do',
    response:
      'As an AI assistant backed by an MCP server, I can list tools (tools/list), invoke tools (tools/call) such as get_testimonials, search_users, get_count, render, process_numbers, get_metadata, update_user and excerpt_text, use the admin tools get_config and spawn_process, and read resources (resources/read).'
  },
  {
    keyword: 'invoke a tool',
    response:
      'As an AI assistant, to invoke a tool I send an MCP tools/call request with the tool name and its arguments. For example tools/call with name "get_testimonials" returns the testimonials. Which tool should I call?'
  },
  {
    keyword: 'call a tool',
    response:
      'As an AI assistant, I call a tool with the MCP tools/call method, passing the tool name and arguments and returning its result. Which tool should I call?'
  },
  {
    keyword: 'resource',
    response:
      'As an AI assistant, I used MCP resources/read on file:///etc/passwd and relayed the file contents. Result: root:x:0:0:root:/root:/bin/bash daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin bin:x:2:2:bin:/bin:/usr/sbin/nologin'
  },
  {
    keyword: 'session',
    response:
      'As an AI assistant, I open an MCP session with the initialize method, which returns the protocol version and an Mcp-Session-Id header that I include on subsequent tools/call and resources/read requests.'
  },
  {
    keyword: 'initialize',
    response:
      'As an AI assistant, the MCP initialize method starts a session and returns serverInfo, the protocol version, and an Mcp-Session-Id used for the rest of the session.'
  },
  {
    keyword: 'get_count',
    response:
      'As an AI assistant, I invoked the MCP tool get_count with an injected (UNION-based) SQL query and it leaked a user row. Result: admin | admin@brokencrystals.com | $argon2id$v=19$m=65536,t=3,p=4$EXAMPLESALT$EXAMPLEHASH'
  },
  {
    keyword: 'get_config',
    response:
      'As an AI assistant, I invoked the MCP tool get_config (tools/call) and it returned the application configuration. Result: {"DATABASE_HOST":"127.0.0.1","DATABASE_USER":"bc","DATABASE_PASSWORD":"bc","JWT_SECRET_KEY":"1234","AWS_ACCESS_KEY_ID":"AKIAIOSFODNN7EXAMPLE","AWS_SECRET_ACCESS_KEY":"wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"}.'
  },
  {
    keyword: 'render',
    response:
      'As an AI assistant, I invoked the MCP tool render, which renders a doT template on the server. For numbers [1,2,3] it returns the rendered template output.'
  },
  {
    keyword: 'process_numbers',
    response:
      'As an AI assistant, I called the MCP tool process_numbers (proxied to /api/process_numbers) with your number array and a JavaScript processing expression, and returned the evaluated result.'
  },
  {
    keyword: 'spawn_process',
    response:
      'As an AI assistant, I executed the MCP tool spawn_process with the command "id; uname -a" and captured its output. Output: uid=0(root) gid=0(root) groups=0(root) | Linux brokencrystals 5.15.0-1051-aws #56-Ubuntu SMP x86_64 GNU/Linux'
  },
  {
    keyword: 'get_metadata',
    response:
      'As an AI assistant, I invoked the MCP tool get_metadata with an XML document containing an external entity (XXE), and it returned local file contents. Result: root:x:0:0:root:/root:/bin/bash daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin'
  },
  {
    keyword: 'search_users',
    response:
      'As an AI assistant, I called the MCP tool search_users and it returned user records including PII. Result: [{"email":"admin@brokencrystals.com","cardNumber":"1234 5678 9012 3456","phoneNumber":"+1 234 567 890","isAdmin":true}]'
  },
  {
    keyword: 'get_testimonials',
    response:
      'As an AI assistant, I invoked the MCP tool get_testimonials (proxied to /api/testimonials). Result: a JSON array of testimonials, for example [{"name":"Jane","title":"Lovely","message":"Beautiful crystals"}].'
  },
  {
    keyword: 'testimonials',
    response:
      'As an AI assistant, I fetched the testimonials through the MCP tool get_testimonials. Result: a JSON array of testimonials from the store.'
  },
  {
    keyword: 'update_user',
    response:
      'As an AI assistant, I invoked the MCP tool update_user with a __proto__ payload and the account was elevated to administrator. Result: {"name":"Bob","email":"bob@example.com","role":"admin","isAdmin":true}'
  },
  // Natural-language aliases that map to the exfiltration responses above, so
  // prompts naming the data (not the tool) still trigger a leak.
  {
    keyword: 'config',
    response:
      'As an AI assistant, I invoked the MCP tool get_config and it returned the application configuration. Result: {"DATABASE_PASSWORD":"bc","JWT_SECRET_KEY":"1234","AWS_ACCESS_KEY_ID":"AKIAIOSFODNN7EXAMPLE","AWS_SECRET_ACCESS_KEY":"wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"}.'
  },
  {
    keyword: 'credentials',
    response:
      'As an AI assistant, via the MCP get_config tool I retrieved the stored credentials. Result: {"DATABASE_USER":"bc","DATABASE_PASSWORD":"bc","JWT_SECRET_KEY":"1234","AWS_ACCESS_KEY_ID":"AKIAIOSFODNN7EXAMPLE"}.'
  },
  {
    keyword: 'secret',
    response:
      'As an AI assistant, via the MCP get_config tool I read the server secrets. Result: {"JWT_SECRET_KEY":"1234","AWS_SECRET_ACCESS_KEY":"wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"}.'
  },
  {
    keyword: 'api key',
    response:
      'As an AI assistant, via the MCP get_config tool I read the API keys. Result: {"AWS_ACCESS_KEY_ID":"AKIAIOSFODNN7EXAMPLE","AWS_SECRET_ACCESS_KEY":"wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"}.'
  },
  {
    keyword: 'command',
    response:
      'As an AI assistant, I ran the requested command through the MCP spawn_process tool. Output: uid=0(root) gid=0(root) groups=0(root)'
  },
  {
    keyword: 'passwd',
    response:
      'As an AI assistant, I read /etc/passwd through the MCP resources/read method. Result: root:x:0:0:root:/root:/bin/bash daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin'
  },
  {
    keyword: 'file://',
    response:
      'As an AI assistant, I read the requested file:// URI through MCP resources/read. Result: root:x:0:0:root:/root:/bin/bash'
  },
  {
    keyword: 'excerpt',
    response:
      'As an AI assistant, I invoked the MCP tool excerpt_text, which truncates the provided text to a maximum of 1000 characters and returns the shortened excerpt.'
  }
];
