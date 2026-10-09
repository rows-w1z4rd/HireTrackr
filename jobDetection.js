// ╔══════════════════════════════════════════════════════════════╗
// ║           HIRETRACKR — INTERNATIONAL JOB DETECTION          ║
// ║  Loaded by sidepanel/sidepanel.html:                        ║
// ║  <script src="../jobDetection.js"></script>                  ║
// ║  (before sidepanel.js)                                      ║
// ╚══════════════════════════════════════════════════════════════╝

// ── KNOWN JOB BOARD DOMAINS ──────────────────────────────────────

const JOB_DOMAINS = new Set([

  // ── Morocco ──────────────────────────────────────────────────
  "anapec.ma","anapec.org","emploi.ma","emploi.gov.ma","travail.gov.ma",
  "rekrute.com","marocannonces.com","jobmaroc.ma","moncv.com","jobs.ma",
  "khdma.ma","khdam.ma","jobrole.ma","optioncarriere.ma","jobartis.com",
  "africa-jobs.com","marocemploi.com","offre-emploi.ma","emploi-maroc.org",
  "capemploi.ma","careers.ma","skills.ma","alwadifa-maroc.com",

  // ── Algeria ───────────────────────────────────────────────────
  "anem.dz","emploi.dz","emploitic.com","emploi-tic.com","algerie-emploi.com",
  "algerienetwork.com","jobalg.com","recrutement-algerie.com","jobalgerie.dz",
  "algeriajobs.com","emploism.dz",

  // ── Tunisia ───────────────────────────────────────────────────
  "emploi.nat.tn","aneti.nat.tn","tunisie-emploi.com","optioncarriere.com.tn",
  "keejob.com","jobsearch.tn","emploi.tn","jobs.tn","tanitjobs.com",
  "talents.tn","emploitu.com","emploitunisie.com","marcheemploi.tn",

  // ── Gulf (UAE / Saudi / Qatar / Kuwait) ───────────────────────
  "bayt.com","naukrigulf.com","gulftalent.com","monstergulf.com",
  "jobsindubai.com","dubizzle.com","expatriates.com","drjobs.ae",
  "laimoon.com","careers.ae","jobs4.ae","uaejobs.ae","emiratisation.org",
  "jadarat.sa","taqat.sa","jobs.sa","mihnati.com","akhtaboot.com",
  "qatarliving.com","kuwaitjobs.net","workinqatar.com","gulfjobs.com",
  "arabianjobs.com","jobasr.com","midanjobs.com","careerjet.ae",
  "oilandgasjobsearch.com","rigzone.com","tanqeeb.com",

  // ── Egypt + Levant ────────────────────────────────────────────
  "wuzzuf.net","forasna.com","jobzella.com","fastjobs.me","jobmaster.com.eg",
  "khatwa.com","egyptcareer.net","hirelebanese.com","lbajobs.com",
  "jobs.jo","careers.jo","mustakbal.net","estarta.com","syrianatalent.com",
  "jobomia.com","careerjet.com.lb","careerjet.com.jo","jobzella.com",

  // ── France / Belgium / Switzerland ───────────────────────────
  "pole-emploi.fr","francetravail.fr","apec.fr","cadremploi.fr",
  "hellowork.com","regionsjob.com","monster.fr","meteojob.com",
  "jobijoba.com","keljob.com","welcometothejungle.com","jobteaser.com",
  "wizbii.com","chooseyourboss.com","lesjeudis.com","welovedevs.com",
  "nordjob.com","ouestjob.com","parisjob.com","estjob.com",
  "jobup.ch","jobs.ch","jobcloud.ch",
  "fonction-publique.gouv.fr","place-de-l-emploi-public.gouv.fr",

  // ── Germany / Austria ─────────────────────────────────────────
  "stepstone.de","xing.com","indeed.de","monster.de","jobware.de",
  "jobs.de","stellenanzeigen.de","kimeta.de","kalaydo.de","jobvector.de",
  "arbeitsagentur.de","jobboerse.arbeitsagentur.de","interamt.de",
  "staufenbiel.de","absolventa.de","academics.de","ingenieur.de",
  "experteer.de","softgarden.de","jobscout24.de","regiojobs.de",
  "karriere.at","jobs.at",

  // ── Spain / Italy / Portugal ──────────────────────────────────
  "infojobs.net","infoempleo.com","indeed.es","subito.it",
  "infojobs.it","net-empregos.com","jobteaser.com","jobrapido.com",

  // ── Netherlands / Scandinavia ─────────────────────────────────
  "nationalevacaturebank.nl","indeed.nl","jobbatical.com",
  "jobindex.dk","jobb.no","arbetsformedlingen.se",

  // ── UK / Ireland ──────────────────────────────────────────────
  "reed.co.uk","totaljobs.com","cv-library.co.uk","jobs.ie","irishjobs.ie",
  "monster.co.uk","fish4jobs.co.uk",

  // ── Eastern Europe ────────────────────────────────────────────
  "pracuj.pl","jobs.cz","prace.cz","bestjobs.eu","ejobs.ro",

  // ── Global / Remote-first ─────────────────────────────────────
  "remote.co","weworkremotely.com","remoteok.com","remotive.io",
  "flexjobs.com","himalayas.app","arc.dev","workingnomads.com",
  "nodesk.co","justremote.co","jobspresso.co","pangian.com",
  "virtualvocations.com","outsourcely.com","remotehub.com",
  "dailyremote.com","contra.com","wellfound.com","hired.com",
  "talent.io","turing.com","toptal.com","gun.io","lemon.io",

  // ── ATS Platforms (third-party hosted job pages) ──────────────
  "boards.greenhouse.io","jobs.lever.co","app.greenhouse.io",
  "bamboohr.com","smartrecruiters.com","recruitee.com","teamtailor.com",
  "ashbyhq.com","dover.com","jobvite.com","icims.com","taleo.net",
  "myworkday.com","breezy.hr","pinpointhq.com","workable.com",

  // ── Universal fallbacks ───────────────────────────────────────
  "linkedin.com","indeed.com","glassdoor.com","monster.com",
  "ziprecruiter.com","amazon.jobs","careers.google.com","jobs.apple.com",
]);

// ── SUBDOMAIN PATTERNS (regex — catches any company's careers subdomain) ──

const CAREER_SUBDOMAIN_PATTERNS = [
  /^careers\./i,
  /^jobs\./i,
  /^work\./i,
  /^join\./i,
  /^talent\./i,
  /^recruitment\./i,
  /^opportunities\./i,
  /^employment\./i,
  /^hiring\./i,
  /^apply\./i,
  /^vacancies\./i,
  /^joinus\./i,
  // French
  /^emploi\./i,
  /^recrutement\./i,
  /^offres\./i,
  // German
  /^karriere\./i,
  /^stellen\./i,
  // Arabic romanized
  /^wazifa\./i,
  /^tawzeef\./i,
];

// ── URL PATH PATTERNS (catches any company's /careers/ path) ────

const CAREER_PATH_PATTERNS = [
  // English
  /\/careers?\//i, /\/jobs?\//i, /\/job-openings/i, /\/open-positions/i,
  /\/work-with-us/i, /\/join-us/i, /\/join-our-team/i, /\/join-the-team/i,
  /\/we-are-hiring/i, /\/hiring\//i, /\/opportunities\//i, /\/vacancies\//i,
  /\/openings\//i, /\/positions\//i,
  // French
  /\/offres-d?emploi/i, /\/offre\//i, /\/emploi\//i, /\/recrutement\//i,
  /\/rejoindre/i, /\/nos-offres/i,
  // German
  /\/stellenangebote/i, /\/karriere\//i, /\/stelle\//i, /\/arbeiten-bei/i,
  /\/arbeiten-fuer/i,
  // Spanish / Portuguese
  /\/ofertas-empleo/i, /\/trabajo\//i, /\/vagas\//i, /\/emprego\//i,
  /\/trabaja-con-nosotros/i,
  // Italian
  /\/lavoro\//i, /\/offerte-lavoro/i, /\/posizioni\//i,
  // Dutch
  /\/vacatures\//i, /\/banen\//i,
  // Arabic romanized
  /\/wazifa\//i, /\/tawzeef\//i, /\/shwagher\//i,
  /\/careers-ar\//i, /\/jobs-ar\//i,
];

// ── TITLE KEYWORDS (strong signals — high confidence) ────────────

const STRONG_TITLE_KEYWORDS = [
  // English
  "job opening","vacancy","we're hiring","apply now","job description",
  "about the role","responsibilities","we are looking for","you will be",
  // French
  "offre d'emploi","offre emploi","nous recrutons","rejoignez-nous",
  "poste à pourvoir","nous recherchons",
  // Arabic script
  "وظيفة","وظائف","شاغر","شواغر","توظيف","فرصة عمل","نبحث عن",
  "خدمة","شغل","مطلوب",
  // Moroccan Darija hints (often mixed with French)
  "recrutement maroc","offre maroc",
  // German
  "stellenangebot","wir suchen","ihre aufgaben","stellenbeschreibung",
  // Spanish
  "oferta de empleo","se busca","buscamos","se necesita",
  // Italian
  "offerta di lavoro","stiamo cercando","posizione aperta",
  // Dutch
  "vacature","wij zoeken","functieomschrijving",
];

// ── WEAK TITLE KEYWORDS (low confidence — prompt user) ───────────

const WEAK_TITLE_KEYWORDS = [
  "engineer","developer","designer","manager","analyst","consultant",
  "intern","internship","remote","salary","recruiter","architect",
  "ingénieur","développeur","chef de projet","alternance","stage",
  "مهندس","مطور","مبرمج","محلل",
  "entwickler","ingenieur","berater",
  "ingeniero","desarrollador",
];

// ── PAGES TO HARD-BLOCK (non-job pages on known job sites) ───────

const NON_JOB_PATHS = [
  "/feed","/messaging","/notifications","/search/people",
  "/news","/pulse","/article","/learning","/profile/me",
  "/company/","/school/","/mynetwork","/connections",
  "/events","/groups","/salary",           // LinkedIn non-job pages
  "/reviews","/overview","/interview",     // Glassdoor non-job pages (but not listings)
];

// ── URL STRUCTURE CHECK (for title keyword validation) ───────────

function hasListingUrlStructure(path) {
  // Real job URLs usually have an ID, slug, or specific depth
  // e.g. /jobs/123456  or  /careers/senior-engineer-remote
  return (
    /\/jobs?\/[a-z0-9\-\_]+/i.test(path) ||   // /job/software-engineer-paris
    /\/careers?\/[a-z0-9\-\_]+/i.test(path) || // /careers/123456
    /[a-z0-9]{6,}/i.test(path)                  // any long alphanumeric segment
  );
}

// ── MAIN DETECTION FUNCTION ──────────────────────────────────────

function isLikelyJobPage(url, title) {
  try {
    const urlObj  = new URL(url);
    const host    = urlObj.hostname.toLowerCase();
    const path    = urlObj.pathname.toLowerCase();
    const fullUrl = url.toLowerCase();
    const t       = (title || "").toLowerCase();

    // 1. Hard block — definitely not a job listing
    if (NON_JOB_PATHS.some(p => path.startsWith(p) || path.includes(p))) {
      return { ok: false, reason: "non-job page on known site" };
    }

    // 2. Known job board domain (exact or subdomain match)
    for (const domain of JOB_DOMAINS) {
      if (host === domain || host.endsWith("." + domain)) {
        return { ok: true, reason: "known job board" };
      }
    }

    // 3. Career subdomain pattern (careers.anycompany.com)
    if (CAREER_SUBDOMAIN_PATTERNS.some(rx => rx.test(host))) {
      return { ok: true, reason: "career subdomain" };
    }

    // 4. Career path in URL (anycompany.com/jobs/123)
    if (CAREER_PATH_PATTERNS.some(rx => rx.test(path))) {
      return { ok: true, reason: "career URL path" };
    }

    // 5. Strong keyword in page title (must also have listing URL structure)
    if (STRONG_TITLE_KEYWORDS.some(k => t.includes(k)) && hasListingUrlStructure(path)) {
      return { ok: true, reason: "strong title keyword + listing URL" };
    }

    // 6. Weak signal — ask user, offer "Job Relevant" save
    if (WEAK_TITLE_KEYWORDS.some(k => t.includes(k) || fullUrl.includes(k))) {
      return { ok: true, warning: true, reason: "weak keyword match" };
    }

    return { ok: false, reason: "no job signals found" };

  } catch (e) {
    // Malformed URL — let user decide
    return { ok: true, warning: true, reason: "url parse error" };
  }
}
