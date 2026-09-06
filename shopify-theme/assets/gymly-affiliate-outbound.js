/**
 * Gymly Online Store — affiliate outbound purchase (browser).
 * Mirrors src/shop/web/affiliateOutboundWeb.ts decisioning for theme runtime.
 * Do not invent tracking parameters. Do not fall back to Gymly cart/checkout.
 */
(function (global) {
  'use strict';

  var TRACKING_KEYS = {
    utm_source: 1,
    utm_medium: 1,
    utm_campaign: 1,
    utm_content: 1,
    utm_term: 1,
    aff_id: 1,
    affiliate_id: 1,
    affiliateid: 1,
    partner_id: 1,
    partnerid: 1,
    click_id: 1,
    clickid: 1,
    irclickid: 1,
    ranmid: 1,
    raneid: 1,
    sharedid: 1,
    subid: 1,
    sub_id: 1,
    tracking_id: 1,
    trackingid: 1,
    awc: 1,
    epid: 1,
    epik: 1,
    ref: 1,
    referral: 1,
  };

  var BLOCKED = {
    gymly: 1,
    gymlyapp: 1,
    javascript: 1,
    data: 1,
    file: 1,
    about: 1,
    intent: 1,
  };

  function truthy(v) {
    if (v == null || v === '') return false;
    var s = String(v).trim().toLowerCase();
    return s === 'true' || s === '1' || s === 'yes';
  }

  function resolveSalesModel(raw) {
    var v = String(raw == null ? '' : raw)
      .trim()
      .toLowerCase();
    return v === 'affiliate' ? 'affiliate' : 'gymly';
  }

  function validateHttpsUrl(raw) {
    if (raw == null || String(raw).trim() === '') {
      return {ok: false, reason: 'empty'};
    }
    var trimmed = String(raw).trim();
    var parsed;
    try {
      parsed = new URL(trimmed);
    } catch (e) {
      return {ok: false, reason: 'invalid'};
    }
    var scheme = parsed.protocol.replace(':', '').toLowerCase();
    if (BLOCKED[scheme]) return {ok: false, reason: 'blocked_scheme'};
    if (scheme !== 'https') return {ok: false, reason: 'insecure'};
    return {ok: true, url: parsed.toString()};
  }

  function hasTrackingParams(url) {
    try {
      var parsed = new URL(url);
      var keys = parsed.searchParams.keys();
      var next = keys.next();
      while (!next.done) {
        if (TRACKING_KEYS[String(next.value).toLowerCase()]) return true;
        next = keys.next();
      }
      return false;
    } catch (e) {
      return false;
    }
  }

  function resolveTrackingStatus(rawUrl, partnerMarkedTracked) {
    var validated = validateHttpsUrl(rawUrl);
    if (!validated.ok) return 'unavailable';
    if (partnerMarkedTracked) return 'configured';
    if (hasTrackingParams(validated.url)) return 'configured';
    return 'untracked';
  }

  function hostnameOf(url) {
    try {
      return new URL(url).hostname;
    } catch (e) {
      return null;
    }
  }

  function resolvePurchaseUi(input) {
    var salesModel = resolveSalesModel(input.destinationTypeRaw);
    if (salesModel === 'gymly') {
      return {
        salesModel: 'gymly',
        allowGymlyCart: true,
        allowOutbound: false,
        ctaEnabled: false,
        affiliateTrackingStatus: null,
        destinationUrl: null,
        destinationHostname: null,
        unavailableReason: null,
      };
    }

    var status = resolveTrackingStatus(
      input.affiliateUrlRaw,
      truthy(input.affiliateTrackedRaw),
    );

    if (status === 'configured') {
      var validated = validateHttpsUrl(input.affiliateUrlRaw);
      if (!validated.ok) {
        return {
          salesModel: 'affiliate',
          allowGymlyCart: false,
          allowOutbound: false,
          ctaEnabled: false,
          affiliateTrackingStatus: 'unavailable',
          destinationUrl: null,
          destinationHostname: null,
          unavailableReason: 'unsafe_url',
        };
      }
      return {
        salesModel: 'affiliate',
        allowGymlyCart: false,
        allowOutbound: true,
        ctaEnabled: true,
        affiliateTrackingStatus: 'configured',
        destinationUrl: validated.url,
        destinationHostname: hostnameOf(validated.url),
        unavailableReason: null,
      };
    }

    var empty =
      input.affiliateUrlRaw == null || String(input.affiliateUrlRaw).trim() === '';
    return {
      salesModel: 'affiliate',
      allowGymlyCart: false,
      allowOutbound: false,
      ctaEnabled: false,
      affiliateTrackingStatus: status,
      destinationUrl: null,
      destinationHostname: null,
      unavailableReason:
        status === 'untracked' ? 'untracked' : empty ? 'missing_url' : 'unavailable',
    };
  }

  function buildClickEvent(input, hostname, timestamp) {
    return {
      event: 'affiliate_outbound_click',
      gymly_product_id: input.productId,
      shopify_product_id: input.productId,
      shopify_variant_id: input.variantId || null,
      product_handle: input.handle,
      partner_brand: input.brand,
      destination_hostname: hostname,
      sales_source: 'gymly_web_shop',
      timestamp: timestamp || new Date().toISOString(),
    };
  }

  function recordClick(payload) {
    try {
      if (global.dataLayer && typeof global.dataLayer.push === 'function') {
        global.dataLayer.push(payload);
      }
      if (typeof global.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
        global.dispatchEvent(
          new CustomEvent('gymly:affiliate_outbound_click', {detail: payload}),
        );
      }
    } catch (e) {
      /* never block navigation */
    }
  }

  function interpolate(template, brand) {
    return String(template || '').replace(/\{\{\s*brand\s*\}\}/gi, brand || '');
  }

  function hideGymlyCart(root) {
    var scope = root.closest('[data-gymly-product-form]') || root.parentElement || document;
    var selectors = [
      'form[action*="/cart/add"]',
      '[data-gymly-gymly-cart]',
      '.product-form__submit',
      'button[name="add"]',
      'input[name="add"]',
      '.shopify-payment-button',
    ];
    selectors.forEach(function (sel) {
      scope.querySelectorAll(sel).forEach(function (el) {
        el.setAttribute('hidden', 'hidden');
        el.setAttribute('aria-hidden', 'true');
        if (el.tagName === 'FORM' || el.tagName === 'BUTTON' || el.tagName === 'INPUT') {
          el.setAttribute('disabled', 'disabled');
        }
        if (el.tagName === 'FORM') {
          el.addEventListener(
            'submit',
            function (ev) {
              ev.preventDefault();
              ev.stopPropagation();
            },
            true,
          );
        }
      });
    });
  }

  function mount(root) {
    if (!root || root.getAttribute('data-gymly-affiliate-ready') === '1') return;
    root.setAttribute('data-gymly-affiliate-ready', '1');

    var input = {
      productId: root.getAttribute('data-product-id') || '',
      handle: root.getAttribute('data-product-handle') || '',
      brand: root.getAttribute('data-brand') || 'Partner',
      destinationTypeRaw: root.getAttribute('data-destination-type'),
      affiliateUrlRaw: root.getAttribute('data-affiliate-url'),
      affiliateTrackedRaw: root.getAttribute('data-affiliate-tracked'),
      variantId: root.getAttribute('data-variant-id'),
      priceVerifiedAt: root.getAttribute('data-price-verified-at'),
    };

    var ui = resolvePurchaseUi(input);
    var gymlyBlock = root.querySelector('[data-gymly-cart-slot]');
    var affiliateBlock = root.querySelector('[data-gymly-affiliate-slot]');
    var cta = root.querySelector('[data-gymly-affiliate-cta]');
    var unavailable = root.querySelector('[data-gymly-affiliate-unavailable]');
    var priceNote = root.querySelector('[data-gymly-price-note]');
    var fulfilment = root.querySelector('[data-gymly-fulfilment]');

    if (ui.salesModel === 'gymly') {
      if (affiliateBlock) affiliateBlock.setAttribute('hidden', 'hidden');
      if (gymlyBlock) gymlyBlock.removeAttribute('hidden');
      return;
    }

    hideGymlyCart(root);
    if (gymlyBlock) gymlyBlock.setAttribute('hidden', 'hidden');
    if (affiliateBlock) affiliateBlock.removeAttribute('hidden');

    var brand = input.brand;
    if (fulfilment) {
      fulfilment.textContent = interpolate(
        fulfilment.getAttribute('data-template') || fulfilment.textContent,
        brand,
      );
    }
    if (priceNote) {
      priceNote.textContent = interpolate(
        priceNote.getAttribute('data-template') || priceNote.textContent,
        brand,
      );
      priceNote.removeAttribute('hidden');
    }

    if (ui.ctaEnabled && ui.destinationUrl && cta) {
      cta.removeAttribute('hidden');
      cta.removeAttribute('aria-disabled');
      cta.removeAttribute('disabled');
      cta.setAttribute('href', ui.destinationUrl);
      cta.setAttribute('target', '_blank');
      cta.setAttribute('rel', 'noopener noreferrer sponsored');
      cta.textContent = interpolate(
        cta.getAttribute('data-label-template') || cta.textContent,
        brand,
      );
      var a11y = cta.getAttribute('data-a11y-template');
      if (a11y) {
        cta.setAttribute('aria-label', interpolate(a11y, brand));
      }
      if (unavailable) unavailable.setAttribute('hidden', 'hidden');

      cta.addEventListener('click', function (ev) {
        // Re-validate at click time; preserve exact URL (no rebuild).
        var latest = resolvePurchaseUi(input);
        if (!latest.ctaEnabled || !latest.destinationUrl) {
          ev.preventDefault();
          if (cta) {
            cta.setAttribute('aria-disabled', 'true');
            cta.removeAttribute('href');
          }
          if (unavailable) unavailable.removeAttribute('hidden');
          return;
        }
        recordClick(
          buildClickEvent(input, latest.destinationHostname || 'unknown'),
        );
        // Let the browser honour target=_blank; do not rewrite href.
        cta.setAttribute('href', latest.destinationUrl);
      });
    } else {
      if (cta) {
        cta.setAttribute('hidden', 'hidden');
        cta.setAttribute('aria-disabled', 'true');
        cta.removeAttribute('href');
        cta.addEventListener('click', function (ev) {
          ev.preventDefault();
        });
      }
      if (unavailable) unavailable.removeAttribute('hidden');
    }
  }

  function init(selector) {
    var nodes = document.querySelectorAll(selector || '[data-gymly-affiliate-root]');
    for (var i = 0; i < nodes.length; i++) mount(nodes[i]);
  }

  var api = {
    validateHttpsUrl: validateHttpsUrl,
    resolveSalesModel: resolveSalesModel,
    resolvePurchaseUi: resolvePurchaseUi,
    buildClickEvent: buildClickEvent,
    recordClick: recordClick,
    mount: mount,
    init: init,
  };

  global.GymlyAffiliateOutbound = api;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      init();
    });
  } else {
    init();
  }
})(typeof window !== 'undefined' ? window : this);
