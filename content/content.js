// HireTrackr — content.js
// Runs inside supported job board pages.
// Extracts job title and company from the DOM when the extension asks for them.

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

  // Most specific domain wins, so boards.greenhouse.io is not swallowed by greenhouse.io.
  function findExtractor() {
    const domain = Object.keys(EXTRACTORS)
      .filter(d => host === d || host.endsWith('.' + d))
      .sort((a, b) => b.length - a.length)[0];
    return domain ? EXTRACTORS[domain] : null;
  }

  function extract() {
    const extractor = findExtractor();
    return {
      title:   findText(extractor?.title   || []).slice(0, 200),
      company: findText(extractor?.company || []).slice(0, 100),
    };
  }

  // The extension asks at the moment the user clicks "Save this job": the page
  // is fully rendered by then, and nothing is lost while the side panel is closed.
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id || msg?.type !== 'GET_JOB_DATA') return;
    sendResponse(extract());
  });

})();
