import { readFileSync } from "node:fs";
const env={};
for(const l of readFileSync(new URL("../../.env.prod.local",import.meta.url),"utf8").split("\n")){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m)env[m[1]]=m[2].trim().replace(/^["']|["']$/g,"")}
console.log("prod url:",env.NEXT_PUBLIC_SUPABASE_URL);
const r=await fetch(env.NEXT_PUBLIC_SUPABASE_URL+"/rest/v1/profiles?select=id&limit=1",{headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:"Bearer "+env.SUPABASE_SERVICE_ROLE_KEY}});
console.log("service-role reach:",r.status);
