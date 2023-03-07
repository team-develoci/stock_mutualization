/* eslint-disable no-undef */
/* eslint-disable no-param-reassign */
'use strict';

/**
 * Controller that renders product detail pages and snippets or includes used on product detail pages.
 * Also renders product tiles for product listings.
 *
 * @module controllers/Product
 */

var params = request.httpParameterMap;

var base = module.superModule;

/* Script Modules */
var app = require('*/cartridge/scripts/app');
var guard = require('*/cartridge/scripts/guard');
var meta = require('*/cartridge/scripts/meta');

/**
 * Checks whether a given product has all required attributes selected, and returns the selected variant if true
 *
 * @param {dw.catalog.Product} product - Product
 * @returns {dw.catalog.Product} - Either input product or selected product variant if all attributes selected
 */
function getSelectedProduct(product) {
    var currentVariationModel = product.updateVariationSelection(params);
    var selectedVariant;

    if (currentVariationModel) {
        selectedVariant = currentVariationModel.getSelectedVariant();
        if (selectedVariant) {
            product = app.getModel('Product').get(selectedVariant);
        }
    }

    return product;
}

/**
 *
 * @param {dw.catalog.Product} product - the Product
 * @returns {Object} - Availability information
 */
function getsmAvailability(product) {
    var Resource = require('dw/web/Resource');
    var StringUtils = require('dw/util/StringUtils');
    var Site = require('dw/system/Site');
    var ProductAvailabilityModel = require('dw/catalog/ProductAvailabilityModel');
    var ProductInventoryMgr = require('dw/catalog/ProductInventoryMgr');

    var stockMutualizationEnabled = Site.current.getCustomPreferenceValue('SM_Enabled');
    var SMInventoryListID = Site.current.getCustomPreferenceValue('SM_InventoryID');
    var isSM = stockMutualizationEnabled && !empty(SMInventoryListID);
    var SMInventoryList = isSM ? ProductInventoryMgr.getInventoryList(SMInventoryListID) : null;
    var availabilityModel = product.availabilityModel;
    var smAvailabilityModel = SMInventoryList ? product.getAvailabilityModel(SMInventoryList) : null;
    var availabilityStatus = availabilityModel.availabilityStatus;
    var smAvailabilityStatus = smAvailabilityModel ? smAvailabilityModel.availabilityStatus : null;
    var inventoryRecord = availabilityModel.inventoryRecord;
    var SMInventoryRecord = smAvailabilityModel ? smAvailabilityModel.inventoryRecord : null;
    var availabilityClass;
    var availabilityMsg;
    var inStockDateMsg;
    var ATS = 0;

    if (
        (availabilityStatus === ProductAvailabilityModel.AVAILABILITY_STATUS_IN_STOCK && inventoryRecord != null && (inventoryRecord.stockLevel.available || inventoryRecord.perpetual)) ||
        (smAvailabilityStatus === ProductAvailabilityModel.AVAILABILITY_STATUS_IN_STOCK && SMInventoryRecord != null && (SMInventoryRecord.stockLevel.available || SMInventoryRecord.perpetual))
        ) {
        availabilityClass = 'in-stock-msg';
        availabilityMsg = StringUtils.format(Resource.msg('global.instock', 'locale', null));
    } else if (
        availabilityStatus === ProductAvailabilityModel.AVAILABILITY_STATUS_PREORDER ||
        smAvailabilityStatus === ProductAvailabilityModel.AVAILABILITY_STATUS_PREORDER
        ) {
        availabilityClass = 'preorder-msg';
        availabilityMsg = StringUtils.format(Resource.msg('global.allpreorder', 'locale', null));
        if (inventoryRecord != null && inventoryRecord.inStockDate != null && inventoryRecord.inStockDate > new Date()) {
            inStockDateMsg = StringUtils.format(Resource.msg('global.inStockDate', 'locale', null), inventoryRecord.inStockDate.toDateString());
        } else if (SMInventoryRecord != null && SMInventoryRecord.inStockDate != null && SMInventoryRecord.inStockDate > new Date()) {
            inStockDateMsg = StringUtils.format(Resource.msg('global.inStockDate', 'locale', null), SMInventoryRecord.inStockDate.toDateString());
        }
    } else if (
        availabilityStatus === ProductAvailabilityModel.AVAILABILITY_STATUS_BACKORDER ||
        smAvailabilityStatus === ProductAvailabilityModel.AVAILABILITY_STATUS_BACKORDER
        ) {
        availabilityClass = 'backorder-msg';
        availabilityMsg = StringUtils.format(Resource.msg('global.allbackorder', 'locale', null));
        if (inventoryRecord != null && inventoryRecord.inStockDate != null && inventoryRecord.inStockDate > new Date()) {
            inStockDateMsg = StringUtils.format(Resource.msg('global.inStockDate', 'locale', null), inventoryRecord.inStockDate.toDateString());
        } else if (SMInventoryRecord != null && SMInventoryRecord.inStockDate != null && SMInventoryRecord.inStockDate > new Date()) {
            inStockDateMsg = StringUtils.format(Resource.msg('global.inStockDate', 'locale', null), SMInventoryRecord.inStockDate.toDateString());
        }
    } else {
        availabilityClass = 'not-available-msg';
        availabilityMsg = Resource.msg('global.allnotavailable', 'locale', null);
    }

    if (inventoryRecord) {
        ATS += inventoryRecord.perpetual ? 999 : inventoryRecord.ATS;
    }
    if (SMInventoryRecord) {
        ATS += SMInventoryRecord.perpetual ? 999 : SMInventoryRecord.ATS;
    }

    return {
        availabilityClass: availabilityClass,
        availabilityMsg: availabilityMsg,
        inStockDateMsg: inStockDateMsg,
        ATS: Math.min(999, ATS).toString(),
        isProductAvailable: ATS > 0
    };
}

/**
 * Renders the product page.
 *
 * If the product is online, gets a ProductView and updates the product data from the httpParameterMap.
 * Renders the product page (product/product template). If the product is not online, sets the response status to 401,
 * and renders an error page (error/notfound template).
 */
function show() {
    var Product = app.getModel('Product');
    var product = Product.get(params.pid.stringValue);
    var currentVariationModel = product.updateVariationSelection(params);
    product = product.isVariationGroup() ? product : getSelectedProduct(product);
    var smAvailability = getsmAvailability(product.object);
    var pdict = {
        product: product,
        DefaultVariant: product.getVariationModel().getDefaultVariant(),
        CurrentOptionModel: product.updateOptionSelection(params),
        CurrentVariationModel: currentVariationModel,
        ATS: smAvailability.ATS
    };

    if (product.isVisible()) {
        meta.update(product);
        meta.updatePageMetaTags(product);
        app.getView('Product', pdict).render(product.getTemplate() || 'product/product');
    } else {
        // @FIXME Correct would be to set a 404 status code but that breaks the page as it utilizes
        // remote includes which the Web Adapter won't resolve.
        response.setStatus(410);
        app.getView().render('error/notfound');
    }
}

/**
 * Renders the product detail page.
 *
 * If the product is online, gets a ProductView and updates the product data from the httpParameterMap.
 * Renders the product detail page (product/productdetail template). If the product is not online, sets the response status to 401,
 * and renders an error page (error/notfound template).
 */
function detail() {
    var Product = app.getModel('Product');
    var product = Product.get(params.pid.stringValue);
    var smAvailability = getsmAvailability(product.object);
    var productID = product.getID();
    var masterID = product.isVariant() || product.isVariationGroup() ? product.getMasterProduct().getID() : productID;

    if (product.isVisible()) {
        app.getView('Product', {
            product: product,
            DefaultVariant: product.getVariationModel().getDefaultVariant(),
            CurrentOptionModel: product.updateOptionSelection(params),
            CurrentVariationModel: product.updateVariationSelection(params),
            availabilityClass: smAvailability.availabilityClass,
            availabilityMsg: smAvailability.availabilityMsg,
            inStockDateMsg: smAvailability.inStockDateMsg,
            ATS: smAvailability.ATS,
            isProductAvailable: smAvailability.isProductAvailable,
            masterID: masterID,
            ID: productID
        }).render(product.getTemplate() || 'product/productdetail');
    } else {
        // @FIXME Correct would be to set a 404 status code but that breaks the page as it utilizes
        // remote includes which the WA won't resolve
        response.setStatus(410);
        app.getView().render('error/notfound');
    }
}

/**
 * Renders the product detail page within the context of a category.
 * Calls the {@link module:controllers/Product~show|show} function.
 * __Important:__ this function is not obsolete and must remain as it is used by hardcoded platform rewrite rules.
 */
function showInCategory() {
    show();
}

/*
 * Web exposed methods
 */
/**
 * Renders the product detail page within the context of a category.
 * @see module:controllers/Product~showInCategory
 */
exports.ShowInCategory = guard.ensure(['get'], showInCategory);

/**
 * Renders the product template.
 * @see module:controllers/Product~show
 */
exports.Show = guard.ensure(['get'], show);

/**
 * Renders the productdetail template.
 * @see module:controllers/Product~detail
 */
exports.Detail = guard.ensure(['get'], detail);

Object.keys(base).forEach(function (key) {
    if (!exports[key]) {
        exports[key] = base[key];
    }
});
