/**
 * DOM and JSON-LD Parsers for PhysicianCareers.ca
 */

const { cleanText } = require('./utils');

/**
 * Extracts comprehensive job details from the active .job-detail-card and JSON-LD
 * @param {import('playwright').Page} page
 * @returns {Promise<Object>}
 */
async function parseJobDetail(page) {
  const domData = await page.evaluate(() => {
    const card = document.querySelector('.job-detail-card');
    if (!card) return null;

    // Helper to get text content safely
    const getText = (selector, parent = card) => {
      const el = parent.querySelector(selector);
      return el ? el.innerText.trim() : null;
    };

    // Helper to get attribute safely
    const getAttr = (selector, attr, parent = card) => {
      const el = parent.querySelector(selector);
      return el ? el.getAttribute(attr) : null;
    };

    // 1. Basic header info
    const title = getText('.job-detail-title');
    const specialtyBadge = getText('.job-specialty-badge-large') || getText('.job-specialty-badge');
    const typeBadge = getText('.job-type-badge-large') || getText('.job-type-badge');

    // 2. Company & Location meta items
    const metaElements = Array.from(card.querySelectorAll('.job-detail-meta .job-detail-meta-item'));
    const company = metaElements.length > 0 ? metaElements[0].innerText.trim() : null;
    const location = metaElements.length > 1 ? metaElements[1].innerText.trim() : null;

    // 3. Info grid items (Compensation, Posted Date, etc.)
    const infoGrid = {};
    card.querySelectorAll('.job-detail-info-item').forEach((item) => {
      const labelEl = item.querySelector('.job-detail-info-label');
      const valEl = item.querySelector('.job-detail-info-value');
      if (labelEl && valEl) {
        const key = labelEl.innerText.trim().toLowerCase().replace(/\s+/g, '_');
        infoGrid[key] = valEl.innerText.trim();
      }
    });

    // 4. Map & Coordinates
    const mapLabel = getText('.job-map-label');
    const mapOpenUrl = getAttr('a.job-map-open', 'href');
    const mapIframeUrl = getAttr('.job-map iframe', 'src');

    // 5. Application gate info
    const gateEl = card.querySelector('.job-detail-application-gate');
    const isApplicationGated = !!gateEl;
    const gateMessage = getText('.job-detail-application-gate__message') || null;

    // 6. Detailed structured sections inside .job-detail-description
    const descEl = card.querySelector('.job-detail-description');
    const rawDescriptionHtml = descEl ? descEl.innerHTML : '';
    const rawDescriptionText = descEl ? descEl.innerText.trim() : '';

    const structuredSections = {};
    let closingDate = null;
    let currentSectionName = 'overview';

    if (descEl) {
      // The elements can be direct children or wrapped inside an inner <div>
      const container = descEl.querySelector(':scope > div') || descEl;
      const nodes = Array.from(container.children);

      for (const node of nodes) {
        const text = node.innerText ? node.innerText.trim() : '';
        const strongEl = node.querySelector('strong');

        // Check for Closing Date
        if (text.includes('Closing Date:')) {
          const match = text.match(/Closing Date:\s*([^\n\r<]+)/i);
          if (match) {
            closingDate = match[1].trim();
          }
          continue;
        }

        // Check for section header
        const isHeader =
          (node.tagName === 'P' && strongEl && strongEl.innerText.trim() === text) ||
          (node.tagName.startsWith('H') && text.length > 0);

        if (isHeader) {
          currentSectionName = text.replace(/:$/, '').trim();
          if (!structuredSections[currentSectionName]) {
            structuredSections[currentSectionName] = [];
          }
          continue;
        }

        // Extract list or paragraph content
        if (node.tagName === 'UL') {
          const listItems = Array.from(node.querySelectorAll('li')).map((li) => li.innerText.trim());
          if (!structuredSections[currentSectionName]) {
            structuredSections[currentSectionName] = [];
          }
          structuredSections[currentSectionName].push(...listItems);
        } else if (node.tagName === 'P' && text.length > 0) {
          if (!structuredSections[currentSectionName]) {
            structuredSections[currentSectionName] = [];
          }
          structuredSections[currentSectionName].push(text);
        }
      }
    }

    // Extract useful external links mentioned in the description
    const externalLinks = [];
    if (descEl) {
      descEl.querySelectorAll('a[href]').forEach((a) => {
        const href = a.getAttribute('href');
        const linkText = a.innerText.trim();
        if (href && !href.startsWith('#')) {
          externalLinks.push({ text: linkText, url: href });
        }
      });
    }

    return {
      title,
      specialty: specialtyBadge,
      employment_type: typeBadge,
      company,
      location,
      compensation: infoGrid.compensation || null,
      posted_date: infoGrid.posted_date || null,
      closing_date: closingDate,
      map: {
        label: mapLabel,
        google_maps_url: mapOpenUrl,
        embed_iframe_url: mapIframeUrl,
      },
      application: {
        is_gated: isApplicationGated,
        gate_message: gateMessage,
      },
      structured_sections: structuredSections,
      external_links: externalLinks,
      raw_description_html: rawDescriptionHtml,
      raw_description_text: rawDescriptionText,
    };
  });

  // Extract JSON-LD JobPosting schema
  const jsonLd = await page.evaluate(() => {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const script of scripts) {
      try {
        const parsed = JSON.parse(script.textContent);
        if (parsed['@type'] === 'JobPosting') {
          return parsed;
        }
      } catch (e) {
        // ignore parse error
      }
    }
    return null;
  });

  // Extract canonical URL & Job ID from URL or JSON-LD
  const pageUrl = page.url();
  const idMatch = pageUrl.match(/([a-f0-9]{24})(?:[/?#]|$)/i);
  const jobId = idMatch ? idMatch[1] : (jsonLd?.identifier?.value || null);

  // Fallback for closing date if present in JSON-LD description
  let closingDate = domData?.closing_date;
  if (!closingDate && jsonLd?.description) {
    const match = jsonLd.description.match(/Closing Date:\s*([^\n\r<&]+)/i);
    if (match) {
      closingDate = match[1].trim();
    }
  }

  // Merge and normalize fields into unified, clean model
  const unifiedJob = {
    job_id: jobId,
    url: pageUrl,
    title: cleanText(domData?.title || jsonLd?.title || ''),
    specialty: cleanText(domData?.specialty || ''),
    employment_type: cleanText(domData?.employment_type || jsonLd?.employmentType || ''),
    company: cleanText(domData?.company || jsonLd?.hiringOrganization?.name || ''),
    location: {
      formatted: cleanText(domData?.location || ''),
      street_address: jsonLd?.jobLocation?.address?.streetAddress || null,
      city: jsonLd?.jobLocation?.address?.addressLocality || null,
      province: jsonLd?.jobLocation?.address?.addressRegion || null,
      country: jsonLd?.jobLocation?.address?.addressCountry || 'CA',
    },
    compensation: cleanText(domData?.compensation || ''),
    dates: {
      posted_date: domData?.posted_date || (jsonLd?.datePosted ? jsonLd.datePosted.slice(0, 10) : null),
      posted_datetime_iso: jsonLd?.datePosted || null,
      closing_date: closingDate || null,
    },
    map: domData?.map || null,
    application: domData?.application || { is_gated: false, gate_message: null },
    structured_sections: domData?.structured_sections || {},
    external_links: domData?.external_links || [],
    description_summary: domData?.raw_description_text ? domData.raw_description_text.slice(0, 300) + '...' : '',
    full_description_text: cleanText(domData?.raw_description_text || jsonLd?.description || ''),
    full_description_html: domData?.raw_description_html || '',
    json_ld: jsonLd || null,
    scraped_at: new Date().toISOString(),
  };

  return unifiedJob;
}

/**
 * Extracts all job card summaries from the left sidebar listing (.job-list-scroll)
 * @param {import('playwright').Page} page
 * @returns {Promise<Array<Object>>}
 */
async function parseJobList(page) {
  return await page.evaluate(() => {
    const items = document.querySelectorAll('.job-list-scroll .job-item');
    return Array.from(items).map((item, index) => {
      const link = item.href;
      const isActive = item.classList.contains('is-active');
      const title = item.querySelector('.job-nav-card__title')?.innerText.trim() || '';
      const typeBadge = item.querySelector('.job-type-badge')?.innerText.trim() || '';
      const specialtyBadge = item.querySelector('.job-specialty-badge')?.innerText.trim() || '';
      const company = item.querySelector('.job-company')?.innerText.trim() || '';
      const location = item.querySelector('.job-location')?.innerText.trim() || '';
      const compensation = item.querySelector('.job-nav-card__compensation-text')?.innerText.trim() || '';
      const startDateText = item.querySelector('.job-nav-card__start-date')?.innerText.trim() || '';
      const startDate = startDateText.replace(/^Starts\s*/i, '').trim();

      // Extract ID from link
      const idMatch = link.match(/([a-f0-9]{24})(?:[/?#]|$)/i);
      const id = idMatch ? idMatch[1] : null;

      return {
        index: index + 1,
        job_id: id,
        title,
        url: link,
        is_active: isActive,
        specialty: specialtyBadge,
        employment_type: typeBadge,
        company,
        location,
        compensation,
        start_date: startDate || null,
      };
    });
  });
}

/**
 * Extracts metadata about total jobs, range, and pagination
 * @param {import('playwright').Page} page
 * @returns {Promise<Object>}
 */
async function parsePaginationMeta(page) {
  return await page.evaluate(() => {
    const totalFoundText = document.querySelector('.result-pill')?.innerText.trim() || '';
    const rangeText = document.querySelector('.range-pill')?.innerText.trim() || '';
    const activePage = document.querySelector('.pagination .page-link.is-active')?.innerText.trim() || '1';

    const pageLinks = Array.from(document.querySelectorAll('.pagination .page-link'));
    const numericPages = pageLinks
      .map((l) => parseInt(l.innerText.trim(), 10))
      .filter((n) => !isNaN(n));
    const maxPage = numericPages.length > 0 ? Math.max(...numericPages) : 1;

    const prevDisabled = document.querySelector('.pagination .page-link--nav.is-disabled') !== null;
    const nextBtn = document.querySelector('.pagination .page-link--nav:last-child');
    const nextDisabled = nextBtn ? nextBtn.classList.contains('is-disabled') : true;

    const totalMatch = totalFoundText.match(/(\d[\d,]*)/);
    const totalJobs = totalMatch ? parseInt(totalMatch[1].replace(/,/g, ''), 10) : null;

    return {
      total_jobs_found: totalJobs,
      total_jobs_raw: totalFoundText,
      showing_range: rangeText,
      current_page: parseInt(activePage, 10) || 1,
      total_pages: maxPage,
      has_prev_page: !prevDisabled,
      has_next_page: !nextDisabled,
    };
  });
}

module.exports = {
  parseJobDetail,
  parseJobList,
  parsePaginationMeta,
};
