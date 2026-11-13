import path from "node:path";
const env=process.env;
const requireValue=name=>{const value=env[name];if(!value||value.includes("REPLACE_")||value.includes("EXAMPLE_"))throw new Error("Missing secure staging setting: "+name);return value;};
try{
 if(env.TGL_ENV!=="staging"||env.NODE_ENV!=="production")throw new Error("Staging must run with TGL_ENV=staging and NODE_ENV=production.");
 const publicOrigin=requireValue("TGL_PUBLIC_ORIGIN"),address=new URL(publicOrigin);
 const expectedDomain=requireValue("STAGING_DOMAIN").toLowerCase();
 if(address.protocol!=="https:"||address.hostname.toLowerCase()!==expectedDomain||!/^(staging|preview)[.-]/.test(expectedDomain)||address.port)throw new Error("A dedicated HTTPS staging hostname is required.");
 if(["thegreenlocker.com","www.thegreenlocker.com","koaslounge.com"].includes(address.hostname))throw new Error("Production hostnames are blocked.");
 if(env.TGL_MAIL_MODE!=="resend"||!env.TGL_RESEND_API_KEY||!env.TGL_EMAIL_FROM)throw new Error("Staging requires a configured transactional email sender.");
 if(requireValue("TGL_INVITE_CODE").length<24)throw new Error("The invitation secret must be at least 24 characters.");
 if(Buffer.from(requireValue("TGL_MFA_ENCRYPTION_KEY"),"base64").length!==32)throw new Error("MFA encryption requires exactly 32 random bytes.");
 if(!requireValue("STAGING_BASIC_AUTH_HASH").startsWith("$2"))throw new Error("Caddy HTTP Basic Auth must use a bcrypt hash.");
 if(!path.resolve(requireValue("TGL_DB_PATH")).startsWith("/data/")||!path.resolve(requireValue("TGL_IMAGE_DIR")).startsWith("/data/"))throw new Error("Staging data and private images must be stored on the dedicated persistent volume.");
 console.log("Staging preflight passed: isolated host, encrypted MFA, mail transport, private auth and persistent data configured.");
}catch(error){console.error("Staging deployment blocked:",error.message);process.exit(1);}
