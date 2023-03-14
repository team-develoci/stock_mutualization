/* eslint-disable no-undef */
/* eslint-disable new-cap */
'use strict';

/**
 * Controller for the multishipping scenario. Multishipping involves more
 * than one shipment, shipping address, and/or shipping method per order.
 *
 * @module controllers/COShippingMultiple
 */

var base = module.superModule;

/* API Includes */
var Transaction = require('dw/system/Transaction');
var ShippingMgr = require('dw/order/ShippingMgr');
var URLUtils = require('dw/web/URLUtils');

/* Script Modules */
var app = require('*/cartridge/scripts/app');
var guard = require('*/cartridge/scripts/guard');

var Cart = app.getModel('Cart');

/**
 * Starting point for multishipping scenario. Renders a page providing address selection for each product line item.
 *
 * @transaction
 */
function start() {
    var cart = Cart.get();

    if (cart) {
        // Stores session and customer addresses in sessionAddressBook attribute.
        Transaction.wrap(function () {
            cart.initAddressBook(customer);
        });

        // Creates for each quantity of ProductLineItems new QuantityLineItems helper objects.
        var quantityLineItems = null;
        var plis = cart.getProductLineItems();
        for (var i = 0; i < plis.length; i++) {
            quantityLineItems = cart.separateQuantities(plis[i], quantityLineItems);
        }

        // eslint-disable-next-line no-use-before-define
        initAddressForms(cart, quantityLineItems);

        app.getController('COShipping').PrepareShipments();
        Transaction.wrap(function () {
            cart.calculate();
        });

        app.getView({
            Basket: cart.object,
            ContinueURL: URLUtils.https('COShippingMultiple-MultiShippingAddresses')
        }).render('checkout/shipping/multishipping/multishippingaddresses');
    } else {
        app.getController('Cart').Show();
        return;
    }
}

/**
 * The second step of multishipping: renders a page for each shipment, providing a shipping method selection per shipment.
 * If a basket exists, renders the multishippingshipments template. If no basket exists, calls the
 * {@link module:controllers/Cart~Show|Cart controller Show function}.
 * @transaction
 */
function startShipments() {
    var cart = Cart.get();

    if (cart) {
        app.getController('COShipping').PrepareShipments();

        // Initializes the forms for the multishipment setting.
        session.forms.multishipping.shippingOptions.clearFormElement();

        app.getForm(session.forms.multishipping.shippingOptions.shipments).copyFrom(cart.getShipments());

        // Initializes the shipping method list for each shipment.
        var count = session.forms.multishipping.shippingOptions.shipments.childCount;
        for (var i = 0; i < count; i++) {
            var shipmentForm = session.forms.multishipping.shippingOptions.shipments[i];
            var shippingMethods = ShippingMgr.getShipmentShippingModel(shipmentForm.object).applicableShippingMethods;

            shipmentForm.shippingMethodID.setOptions(shippingMethods.iterator());
        }

        Transaction.wrap(function () {
            cart.calculate();
        });

        app.getView({
            Basket: cart.object,
            ContinueURL: URLUtils.https('COShippingMultiple-MultiShippingMethods')
        }).render('checkout/shipping/multishipping/multishippingshipments');
    } else {
        app.getController('Cart').Show();
        return;
    }
}

/**
 * Form handler for multishipping form. Handles the save action. Updates the cart calculation, creates shipments
 * and renders the multishippingaddress template.
 */
function multiShippingAddresses() {
    var multiShippingForm = app.getForm('multishipping');

    multiShippingForm.handleAction({
        save: function () {
            var cart = Cart.get();

            var result = Transaction.wrap(function () {
                var MergeQuantities = require('*/cartridge/scripts/checkout/multishipping/MergeQuantities');
                var ScriptResult = MergeQuantities.execute({
                    CBasket: cart.object,
                    QuantityLineItems: session.forms.multishipping.addressSelection.quantityLineItems
                });
                return ScriptResult;
            });

            if (result) {
                Transaction.wrap(function () {
                    cart.calculate();
                });

                multiShippingForm.setValue('addressSelection.fulfilled', true);

                startShipments();
                return;
            }
            app.getView({
                Basket: cart.object,
                ContinueURL: URLUtils.https('COShippingMultiple-MultiShippingAddresses')
            }).render('checkout/shipping/multishipping/multishippingaddresses');
            return;
        }
    });
}

/**
 * Initializes the forms for the multiaddress selection.
 * @param {CartModel} cart - Cart
 * @param {Array<QuantityLineItemModel>} quantityLineItems - QuantityLineItems
 */
function initAddressForms(cart, quantityLineItems) {
    // Set flag, that customer has entered the multi shipping scenario.
    session.forms.multishipping.entered.value = true;

    if (!session.forms.multishipping.addressSelection.fulfilled.value) {
        session.forms.multishipping.addressSelection.clearFormElement();
        app.getForm(session.forms.multishipping.addressSelection.quantityLineItems).copyFrom(quantityLineItems);
    }

    var addresses = cart.getAddressBookAddresses();

    if (!addresses) {
        start();
        return;
    }
    for (var i = 0; i < session.forms.multishipping.addressSelection.quantityLineItems.childCount; i++) {
        var quantityLineItem = session.forms.multishipping.addressSelection.quantityLineItems[i];
        quantityLineItem.addressList.setOptions(addresses.iterator());
    }
}

/*
 * Module exports
 */

/*
 * Web exposed methods
 */
/** Starting point for multishipping scenario.
 * @see module:controllers/COShippingMultiple~start */
exports.Start = guard.ensure(['https'], start);
/** The second step of multishipping: renders a page for each shipment, providing a shipping method selection per shipment.
 * @see module:controllers/COShippingMultiple~startShipments */
exports.StartShipments = guard.ensure(['https', 'get'], startShipments);
/** Form handler for multishipping form. Handles the save action.
 * @see module:controllers/COShippingMultiple~multiShippingAddresses */
exports.MultiShippingAddresses = guard.ensure(['https', 'post'], multiShippingAddresses);

Object.keys(base).forEach(function (key) {
    if (!exports[key]) {
        exports[key] = base[key];
    }
});
