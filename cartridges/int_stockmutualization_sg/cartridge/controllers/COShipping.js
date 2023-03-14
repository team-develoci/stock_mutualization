/* eslint-disable one-var */
/* eslint-disable one-var-declaration-per-line */
/* eslint-disable no-undef */
/* eslint-disable new-cap */
'use strict';

/**
 * Controller for the default single shipping scenario.
 * Single shipping allows only one shipment, shipping address, and shipping method per order.
 *
 * @module controllers/COShipping
 */

var base = module.superModule;

/* API Includes */
var Resource = require('dw/web/Resource');
var Site = require('dw/system/Site');
var Transaction = require('dw/system/Transaction');
var URLUtils = require('dw/web/URLUtils');

/* Script Modules */
var app = require('*/cartridge/scripts/app');
var guard = require('*/cartridge/scripts/guard');

/**
 * Prepares shipments. Theis function separates gift certificate line items from product
 * line items. It creates one shipment per gift certificate purchase
 * and removes empty shipments. If in-store pickup is enabled, it combines the
 * items for in-store pickup and removes them.
 * This function can be called by any checkout step to prepare shipments.
 *
 * @transactional
 * @return {boolean} true if shipments are successfully prepared, false if they are not.
 */
function prepareShipments() {
    var cart, homeDeliveries;
    cart = app.getModel('Cart').get();

    homeDeliveries = Transaction.wrap(function () {
        // eslint-disable-next-line no-shadow
        var homeDeliveries = false;

        cart.updateGiftCertificateShipments();
        cart.removeEmptyShipments();

        if (Site.getCurrent().getCustomPreferenceValue('enableStorePickUp')) {
            homeDeliveries = cart.consolidateInStoreShipments();

            session.forms.singleshipping.inStoreShipments.shipments.clearFormElement();
            app.getForm('singleshipping.inStoreShipments.shipments').copyFrom(cart.getShipments());
        } else {
            homeDeliveries = true;
        }

        return homeDeliveries;
    });

    return homeDeliveries;
}

/**
 * Starting point for the single shipping scenario. Prepares a shipment by removing gift certificate and in-store pickup line items from the shipment.
 * Redirects to multishipping scenario if more than one physical shipment is required and redirects to billing if all line items do not require
 * shipping.
 *
 * @transactional
 */
function start() {
    var cart = app.getModel('Cart').get();
    var physicalShipments, pageMeta, homeDeliveries;

    if (!cart) {
        app.getController('Cart').Show();
        return;
    }
    // Redirects to multishipping scenario if more than one physical shipment is contained in the basket.
    physicalShipments = cart.getPhysicalShipments();
    if (Site.getCurrent().getCustomPreferenceValue('enableMultiShipping') && physicalShipments && physicalShipments.size() > 1) {
        app.getController('COShippingMultiple').Start();
        return;
    }

    // Initializes the singleshipping form and prepopulates it with the shipping address of the default
    // shipment if the address exists, otherwise it preselects the default shipping method in the form.
    if (cart.getDefaultShipment().getShippingAddress()) {
        app.getForm('singleshipping.shippingAddress.addressFields').copyFrom(cart.getDefaultShipment().getShippingAddress());
        app.getForm('singleshipping.shippingAddress.addressFields.states').copyFrom(cart.getDefaultShipment().getShippingAddress());
        app.getForm('singleshipping.shippingAddress').copyFrom(cart.getDefaultShipment());
    } else if (customer.authenticated && customer.registered && customer.addressBook.preferredAddress) {
        app.getForm('singleshipping.shippingAddress.addressFields').copyFrom(customer.addressBook.preferredAddress);
        app.getForm('singleshipping.shippingAddress.addressFields.states').copyFrom(customer.addressBook.preferredAddress);
    }
    session.forms.singleshipping.shippingAddress.shippingMethodID.value = cart.getDefaultShipment().getShippingMethodID();

    // Prepares shipments.
    homeDeliveries = prepareShipments();

    Transaction.wrap(function () {
        cart.calculate();
    });

    // Go to billing step, if we have no product line items, but only gift certificates in the basket, shipping is not required.
    if (cart.getProductLineItems().size() === 0) {
        app.getController('COBilling').Start();
    } else {
        pageMeta = require('~/cartridge/scripts/meta');
        pageMeta.update({
            pageTitle: Resource.msg('singleshipping.meta.pagetitle', 'checkout', 'SiteGenesis Checkout')
        });
        app.getView({
            ContinueURL: URLUtils.https('COShipping-SingleShipping'),
            Basket: cart.object,
            HomeDeliveries: homeDeliveries
        }).render('checkout/shipping/singleshipping');
    }
}

/*
* Module exports
*/

/*
* Web exposed methods
*/
/** Starting point for the single shipping scenario.
 * @see module:controllers/COShipping~start */
exports.Start = guard.ensure(['https'], start);

/*
 * Local methods
 */
exports.PrepareShipments = prepareShipments;

Object.keys(base).forEach(function (key) {
    if (!exports[key]) {
        exports[key] = base[key];
    }
});
