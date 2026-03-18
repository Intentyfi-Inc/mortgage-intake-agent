import fs from 'fs';

async function run() {
  const req = await fetch('http://localhost:3001/api/intentyfi/db/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 'query-name': 'getAllMortgageApplications' })
  });
  const apps = await req.json();
  const firstAppId = apps[0].ObjectID;
  
  const req2 = await fetch(`http://localhost:3001/api/intentyfi/object/get?object=MortgageApplication@mti.intentyfi.co:${firstAppId}&includeRels=true`);
  const appFull = await req2.json();
  
  fs.writeFileSync('api-out.json', JSON.stringify(appFull, null, 2));
}

run().catch(console.error);
