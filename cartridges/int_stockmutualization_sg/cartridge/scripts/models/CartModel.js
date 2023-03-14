/* eslint-disable no-param-reassign */
/* eslint-disable new-cap */
/* eslint-disable no-undef */
'use strict';
/**
 * Model for cart functionality. Creates a CartModel class with payment, shipping, and product
 * helper methods.
 * @module models/CartModel
 */
var base = module.superModule;

var Site = require('dw/system/Site');
var Transaction = require('dw/system/Transaction');
var ArrayList = require('dw/util/ArrayList');
var Product = require('*/cartridge/scripts/models/ProductModel');
var QuantityLineItem = require('*/cartridge/scripts/models/QuantityLineItemModel');
var ProductListMgr = require('dw/customer/ProductListMgr');
var ProductInventoryMgr = require('dw/catalog/ProductInventoryMgr');
var BasketMgr = require('dw/order/BasketMgr');

var app = require('*/cartridge/scripts/app');
var ProductList = app.getModel('ProductList');

var stockMutualizationEnabled = Site.current.getCustomPreferenceValue('SM_Enabled');
var SMInventoryListID = Site.current.getCustomPreferenceValue('SM_InventoryID');

var CartModel = base.extend({
    addProductToCart: function () {
        var cart = this;
        var params = request.httpParameterMap;
        var format = params.format && params.format.stringValue ? params.format.stringValue.toLowerCase() : '';
        var newBonusDiscountLineItem;
        var productOptionModel;
        var productToAdd;
        var template = 'checkout/cart/minicart';

        // Edit details of a gift registry
        if (params.source && params.source.stringValue === 'giftregistry' && params.cartAction && params.cartAction.stringValue === 'update') {
            ProductList.replaceProductListItem();
            return {
                source: 'giftregistry'
            };
        }

        if (params.source && params.source.stringValue === 'wishlist' && params.cartAction && params.cartAction.stringValue === 'update') {
            app.getController('Wishlist').ReplaceProductListItem();
            // eslint-disable-next-line consistent-return
            return;
        }

        // Updates a product line item.
        if (params.uuid.stringValue) {
            var lineItem = cart.getProductLineItemByUUID(params.uuid.stringValue);
            if (lineItem) {
                var productModel = Product.get(params.pid.stringValue);
                var quantity = parseInt(params.Quantity.value, 10);

                productToAdd = productModel.object;
                productOptionModel = productModel.updateOptionSelection(params);

                Transaction.wrap(function () {
                    cart.updateLineItem(lineItem, productToAdd, quantity, productOptionModel);
                });

                if (format === 'ajax') {
                    template = 'checkout/cart/refreshcart';
                }
            } else {
                return {
                    template: 'checkout/cart/cart'
                };
            }
        // Adds a product from a product list.
        } else if (params.plid.stringValue) {
            var productList = ProductListMgr.getProductList(params.plid.stringValue);
            if (productList) {
                cart.addProductListItem(productList.getItem(params.itemid.stringValue), params.Quantity.doubleValue);
            }
        // Adds a product.
        } else {
            var previousBonusDiscountLineItems = cart.getBonusDiscountLineItems();
            productToAdd = Product.get(params.pid.stringValue);

            if (productToAdd.object.isProductSet()) {
                var childPids = params.childPids.stringValue.split(',');
                var childQtys = params.childQtys.stringValue.split(',');
                var counter = 0;

                for (var i = 0; i < childPids.length; i++) {
                    var childProduct = Product.get(childPids[i]);

                    if (childProduct.object && !childProduct.isProductSet()) {
                        var childProductOptionModel = childProduct.updateOptionSelection(params);
                        cart.addProductItem(childProduct.object, parseInt(childQtys[counter], 10), childProductOptionModel);
                    }
                    counter++;
                }
            } else {
                productOptionModel = productToAdd.updateOptionSelection(params);
                cart.addProductItem(productToAdd.object, params.Quantity.doubleValue, productOptionModel);
            }

            // When adding a new product to the cart, check to see if it has triggered a new bonus discount line item.
            newBonusDiscountLineItem = cart.getNewBonusDiscountLineItem(previousBonusDiscountLineItems);
        }

        return {
            format: format,
            template: template,
            BonusDiscountLineItem: newBonusDiscountLineItem
        };
    },
    /**
     * Adds a product to the cart and recalculates the cart.
     * By default, when a bundle is added to cart, all its child products are added too, but if those products are
     * variants then the code must replace the master products with the selected variants that are passed in the
     * HTTP params as childPids along with any options.
     * @params {request.httpParameterMap.childPids} - comma separated list of
     * product IDs of the bundled products that are variations.
     *
     * @transactional
     * @alias module:models/CartModel~CartModel/addProductItem
     * @param {dw.catalog.Product} product - the product that is to be added to the basket.
     * @param {number} quantity - The quantity of the product.
     * @param {dw.catalog.ProductOptionModel} productOptionModel - The option model of the product that is to be added to the basket.
     */
    addProductItem: function (product, quantity, productOptionModel) {
        var cart = this;
        Transaction.wrap(function () {
            if (product) {
                var availableToSell = 0;
                var canBeAdded = false;

                var productInCart;
                var smProductInCart;
                var productLineItem;
                var smProductLineItem;
                var productLineItems = cart.object.productLineItems;
                var quantityInCart;
                var quantityToSet;
                var shipment = cart.object.defaultShipment;
                var smShipment = cart.object.getShipment('sm') ? cart.object.getShipment('sm') : cart.object.createShipment('sm');
                var hasAllocationOnSite = !empty(product.availabilityModel) && !empty(product.availabilityModel.inventoryRecord);


                for (var q = 0; q < productLineItems.length; q++) {
                    if (productLineItems[q].productID === product.ID) {
                        productInCart = productLineItems[q];
                        break;
                    }
                }

                for (var s = 0; s < productLineItems.length; s++) {
                    if (productLineItems[s].productID === product.ID && productLineItems[s].productInventoryListID === SMInventoryListID) {
                        productInCart = productLineItems[s];
                        break;
                    }
                }

                if (hasAllocationOnSite) {
                    availableToSell = product.availabilityModel.inventoryRecord.ATS.value;
                }
                var totalQtyRequested = quantity;
                if (productInCart) totalQtyRequested += productInCart.quantityValue;
                if (smProductInCart) totalQtyRequested += smProductInCart.quantityValue;

                canBeAdded = totalQtyRequested <= availableToSell;

                if (!canBeAdded && stockMutualizationEnabled && !empty(SMInventoryListID)) {
                    var smAvailable = 0;
                    var missingQty = totalQtyRequested - availableToSell;
                    var smInventory = ProductInventoryMgr.getInventoryList(SMInventoryListID);
                    if (smInventory && smInventory.getRecord(product.ID)) {
                        smAvailable = smInventory.getRecord(product.ID).ATS.value;
                    }

                    if (smAvailable >= missingQty) {
                        canBeAdded = true;

                        if (smProductInCart) {
                            smProductInCart.setQuantityValue(missingQty);
                            quantity -= missingQty;
                            smProductLineItem = smProductInCart;
                        } else {
                            // Split Shipments so that each PLI can have a different inventory list assigned
                            smProductLineItem = cart.createProductLineItem(product, productOptionModel, smShipment);
                            smProductLineItem.setQuantityValue(missingQty);

                            // Sets the Inventory List to the SM one
                            Transaction.wrap(function () {
                                smProductLineItem.setProductInventoryList(smInventory);
                                if (product.bundle) {
                                    for (var a = 0; a < smProductLineItem.bundledProductLineItems.length; a++) {
                                        smProductLineItem.bundledProductLineItems[a].setProductInventoryList(smInventory);
                                    }
                                }
                            });

                            quantity -= missingQty;
                        }
                    }
                }

                if (quantity > 0) {
                    if (productInCart) {
                        if (productInCart.optionModel) {
                            productLineItem = cart.createProductLineItem(product, productOptionModel, shipment);
                            if (quantity) {
                                productLineItem.setQuantityValue(quantity);
                            }
                        } else {
                            quantityInCart = productInCart.getQuantity();
                            quantityToSet = quantity ? quantity + quantityInCart : quantityInCart + 1;
                            productInCart.setQuantityValue(quantityToSet);
                        }
                    } else {
                        productLineItem = cart.createProductLineItem(product, productOptionModel, shipment);

                        if (quantity) {
                            productLineItem.setQuantityValue(quantity);
                        }
                    }

                    // Transaction.wrap(function () {
                    //     productLineItem.setProductInventoryList(ProductInventoryMgr.getInventoryList());
                    // });
                }

                /**
                 * By default, when a bundle is added to cart, all its child products are added too, but if those products are
                 * variants then the code must replace the master products with the selected variants that get passed in the
                 * HTTP params as childPids along with any options. Params: CurrentHttpParameterMap.childPids - comma separated list of
                 * pids of the bundled products that are variations.
                 */
                if (request.httpParameterMap.childPids.stringValue && product.bundle) {
                    var childPids = request.httpParameterMap.childPids.stringValue.split(',');

                    for (var i = 0; i < childPids.length; i++) {
                        var childProduct = Product.get(childPids[i]).object;

                        if (childProduct) {
                            childProduct.updateOptionSelection(request.httpParameterMap);

                            var foundLineItem = this.getBundledProductLineItemByPID(lineItem, childProduct.isVariant() ? childProduct.masterProduct.ID : childProduct.ID);

                            if (foundLineItem) {
                                foundLineItem.replaceProduct(childProduct);
                            }
                        }
                    }
                }
                cart.calculate();
            }
        });
    },
    /**
     * Creates a new QuantityLineItem helper object for each quantity of a ProductLineItem, if one does not already exist.
     * It does not create QuantityLineItems for products using in-store pickup as the shipping method or from Stock Mutualization.
     *
     * @alias module:models/CartModel~CartModel/separateQuantities
     * @param {dw.order.ProductLineItem} pli - The ProductLineItem.
     * @param {dw.util.ArrayList} quantityLineItems - The existing QuantityLineItems.
     * @returns {dw.util.ArrayList} A list of separated QuantityLineItems.
     */
    separateQuantities: function (pli, quantityLineItems) {
        var quantity = pli.quantityValue;

        // Creates new ArrayList if there are no QLIs
        if (!quantityLineItems) {
            quantityLineItems = new ArrayList();
        }

        // Creates for each quantity of the ProductLineItem a new QuantityLineItem.
        for (var i = 0; i < quantity; i++) {
            // Skips plis that are using the in-store pick up shipping method.
            if (empty(pli.custom.fromStoreId)) {
                quantityLineItems.add(new QuantityLineItem(pli));
            }
        }

        return quantityLineItems;
    }
});

/**
 * Gets a new instance for the current or a given basket.
 *
 * @alias module:models/CartModel~CartModel/get
 * @param {dw.order.Basket} parameter - The basket object to enhance/wrap. If NULL the basket is retrieved from
 * the current session, if existing.
 * @returns {module:models/CartModel~CartModel} - The Cart Model
 */
CartModel.get = function (parameter) {
    var basket = null;

    if (!parameter) {
        var currentBasket = BasketMgr.getCurrentBasket();

        if (currentBasket !== null) {
            basket = currentBasket;
        }
    } else if (typeof parameter === 'object') {
        basket = parameter;
    }
    return (basket !== null) ? new CartModel(basket) : null;
};

/**
 * Gets or creates a new instance of a basket.
 *
 * @alias module:models/CartModel~CartModel/goc
 * @returns {module:models/CartModel~CartModel} - The Cart Model
 */
CartModel.goc = function () {
    var obj = null;

    var basket = BasketMgr.getCurrentOrNewBasket();

    if (basket && basket !== null) {
        obj = basket;
    }

    return new CartModel(obj);
};

module.exports = CartModel;
