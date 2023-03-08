/* eslint-disable no-undef */
'use strict';

var base = module.superModule;

/**
 * Controller that adds and removes products and coupons in the cart.
 * Also provides functions for the continue shopping button and minicart.
 *
 * @module controllers/Cart
 */

/* API Includes */
var URLUtils = require('dw/web/URLUtils');

/* Script Modules */
var app = require('*/cartridge/scripts/app');
var guard = require('*/cartridge/scripts/guard');

/**
 * Adds or replaces a product in the cart, gift registry, or wishlist.
 * If the function is being called as a gift registry update, calls the
 * {@link module:controllers/GiftRegistry~replaceProductListItem|GiftRegistry controller ReplaceProductListItem function}.
 * The httpParameterMap source and cartAction parameters indicate how the function is called.
 * If the function is being called as a wishlist update, calls the
 * {@link module:controllers/Wishlist~replaceProductListItem|Wishlist controller ReplaceProductListItem function}.
 * If the product line item for the product to add has a:
 * - __uuid__ - gets a ProductModel that wraps the product and determines the product quantity and options.
 * In a transaction, calls the {@link module:models/CartModel~CartModel/updateLineItem|CartModel updateLineItem} function to replace the current product in the line
 * item with the new product.
 * - __plid__ - gets the product list and adds a product list item.
 * Otherwise, adds the product and checks if a new discount line item is triggered.
 * Renders the checkout/cart/refreshcart template if the httpParameterMap format parameter is set to ajax,
 * otherwise renders the checkout/cart/cart template.
 */
function addProduct() {
    var cart = app.getModel('Cart').goc();
    var renderInfo = cart.addProductToCart();

    if (renderInfo.source === 'giftregistry') {
        app.getView().render('account/giftregistry/refreshgiftregistry');
    } else if (renderInfo.template === 'checkout/cart/cart') {
        app.getView('Cart', {
            Basket: cart
        }).render(renderInfo.template);
    } else if (renderInfo.format === 'ajax') {
        app.getView('Cart', {
            cart: cart,
            BonusDiscountLineItem: renderInfo.BonusDiscountLineItem
        }).render(renderInfo.template);
    } else {
        response.redirect(URLUtils.url('Cart-Show'));
    }
}

/*
* Module exports
*/

/*
* Exposed methods.
*/
/** Adds a product to the cart.
 * @see {@link module:controllers/Cart~addProduct} */
exports.AddProduct = guard.ensure(['post'], addProduct);

Object.keys(base).forEach(function (key) {
    if (!exports[key]) {
        exports[key] = base[key];
    }
});
