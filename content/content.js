// HireTrack — content.js
// Runs inside supported job board pages.
// Extracts job title and company from the DOM and sends to the extension.

(function () {
  'use strict';

  const host = location.hostname.replace(/^www\./, '');

  // Per-board DOM selectors. First matching selector wins.
  const EXTRACTORS = {
    'linkedin.com': {
      title:   ['h1.job-details-jobs-unified-top-card__job-title', 'h1.topcard__title'],
      company: ['.job-details-jobs-unified-top-card__company-name a', '.topcard__org-name-link', '.topcard__flavor a'],
    },
    'indeed.com': {
      title:   ['h1[data-testid="jobsearch-JobInfoHeader-title"]', 'h1.jobsearch-JobInfoHeader-title'],
      company: ['[data-testid="inlineHeader-companyName"] a', '[data-testid="inlineHeader-companyName"]'],
    },
    'greenhouse.io': {
      title:   ['h1.app-title', '.posting-headline h2'],
      company: ['.company-name', '.posting-headline .sort-by-time'],
    },
    'lever.co': {
      title:   ['.posting-headline h2', 'h2.posting-name'],
      company: ['.main-header-text .large-category-label', '.posting-categories .sort-by-time'],
    },
    'glassdoor.com': {
      title:   ['[data-test="job-title"]', 'h1.job-title'],
      company: ['[data-test="employer-name"]', '.employer-name'],
    },
    'rekrute.com': {
      title:   ['h1.job_title', '.bloc-offre-title h1', 'h1'],
      company: ['.recruiter-name a', '.company-name', '.recruiter-name'],
    },
    'bayt.com': {
      title:   ['h1.jb-job-title', 'h1[class*="job-title"]', 'h1'],
      company: ['.jb-company-name a', '.company-name a', '[class*="company"] a'],
    },
    'wuzzuf.net': {
      title:   ['h1.css-f5jndf', 'h1[class*="title"]', 'h1'],
      company: ['a[class*="css-17s97q8"]', 'a[class*="company"]'],
    },
    'akhtaboot.com': {
      title:   ['.job-title h1', 'h1'],
      company: ['.company-info .company-name', '.job-company'],
    },
    'emploi.ma': {
      title:   ['.job-header h1', 'h1.job-title', 'h1'],
      company: ['.company-name', '.employer-name'],
    },
    'myworkday.com': {
      title:   ['h2[data-automation-id="jobPostingHeader"]', 'h1'],
      company: [],  // company is typically in the subdomain (e.g. stripe.wd1.myworkday.com)
    },
    'boards.greenhouse.io': {
      title:   ['h1.job-post__title', 'h1'],
      company: ['a.job-post__company-name'],
    },
    'jobs.lever.co': {
      title:   ['.posting-headline h2'],
      company: ['.main-header-text .sort-by-time'],
    },
    'ashbyhq.com': {
      title:   ['h1[class*="jobTitle"]', 'h1'],
      company: ['[class*="companyName"]'],
    },
  };

  function findText(selectors) {
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el?.innerText?.trim()) return el.innerText.trim().replace(/\s+/g, ' ');
    }
    return '';
  }

  function findExtractor() {
    for (const [domain, config] of Object.entries(EXTRACTORS)) {
      if (host.includes(domain)) return config;
    }
    return null;
  }

  function tryExtract() {
    const extractor = findExtractor();
    if (!extractor) return;

    const title   = findText(extractor.title   || []).slice(0, 200);
    const company = findText(extractor.company || []).slice(0, 100);

    if (title || company) {
      chrome.runtime.sendMessage({
        type:    'JOB_DATA',
        title:   title,
        company: company,
        url:     location.href
      });
    }
  }

  // Try immediately (most pages are already loaded when content script runs)
  tryExtract();

  // Also try after a short delay for SPAs (React/Vue pages that render after JS runs)
  setTimeout(tryExtract, 1500);

  // Watch for DOM changes (for single-page apps that navigate without full reload)
  let lastUrl = location.href;
  const observer = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      setTimeout(tryExtract, 1000); // wait for new page content to load
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

})();