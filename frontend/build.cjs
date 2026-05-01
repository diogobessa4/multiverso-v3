const fs = require('fs');
const path = require('path');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error('❌ Variáveis SUPABASE_URL e SUPABASE_ANON_KEY não definidas.');
  process.exit(1);
}

const config = `window.__env = {\n  supabaseUrl: "${url}",\n  supabaseKey: "${key}"\n};\n`;
fs.writeFileSync(path.join(__dirname, 'config.js'), config);
console.log('✅ config.js gerado com sucesso.');
