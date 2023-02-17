'use strict';

var base = module.superModule;

var Site = require('dw/system/Site');
var Resource = require('dw/web/Resource');
var Transaction = require('dw/system/Transaction');
var ProductMgr = require('dw/catalog/ProductMgr');
var ProductInventoryMgr = require('dw/catalog/ProductInventoryMgr');

var productHelper = require('*/cartridge/scripts/helpers/productHelpers');

/**
 * Filter ProductLineItems by matching the Stock Mutualization Inventory List
 * @param {dw.catalog.Product} product - Product object
 * @param {string} productId - Product ID to match
 * @param {dw.util.Collection<dw.order.ProductLineItem>} productLineItems - Collection of the Cart's
 *     product line items
 * @param {string[]} childProducts - the products' sub-products
 * @param {SelectedOption[]} options - product options
 * @param {string} SMInventoryListID - Stock Mutualization Inventory List ID
 * @return {dw.order.ProductLineItem} - Filtered the product line item matching productId
 *  and has the same bundled items or options and the same SM Inventory List
 */
function getSMProductInCart(product, productId, productLineItems, childProducts, options, SMInventoryListID) {
    var smProductLineItem = null;
    var matchingProducts = base.getExistingProductLineItemsInCart(
        product,
        productId,
        productLineItems,
        childProducts,
        options);
    if (matchingProducts.length) {
        var matches = matchingProducts.filter(function(p) {
            return p.productInventoryListID === SMInventoryListID;
        });
        smProductLineItem = !empty(matches) ? matches[0] : null;
    }
    return smProductLineItem;
}

/**
 * Adds a product to the cart. If the product is already in the cart it increases the quantity of
 * that product.
 * @param {dw.order.Basket} currentBasket - Current users's basket
 * @param {string} productId - the productId of the product being added to the cart
 * @param {number} quantity - the number of products to the cart
 * @param {string[]} childProducts - the products' sub-products
 * @param {SelectedOption[]} options - product options
 *  @return {Object} returns an error object
 */
base.addProductToCart = function (currentBasket, productId, quantity, childProducts, options) {
    var stockMutualizationEnabled = Site.current.getCustomPreferenceValue('SM_Enabled');
    var SMInventoryListID = Site.current.getCustomPreferenceValue('SM_InventoryID');

    var availableToSell = 0;
    var totalAvailable = 0;
    var defaultShipment = currentBasket.defaultShipment;
    var smShipment = currentBasket.getShipment('sm') ? currentBasket.getShipment('sm') : currentBasket.createShipment('sm');
    var perpetual;
    var product = ProductMgr.getProduct(productId);
    var productInCart;
    var smProductInCart;
    var productLineItem;
    var smProductLineItem;
    var productLineItems = currentBasket.productLineItems;
    var productQuantityInCart;
    var quantityToSet;
    var optionModel = productHelper.getCurrentOptionModel(product.optionModel, options);
    var hasAllocationOnSite = !empty(product.availabilityModel) && !empty(product.availabilityModel.inventoryRecord);
    
    var result = {
        error: false,
        message: Resource.msg('text.alert.addedtobasket', 'product', null)
    };

    var totalQtyRequested = 0;
    var canBeAdded = false;

    if (hasAllocationOnSite) {
        availableToSell = product.availabilityModel.inventoryRecord.ATS.value;
        totalAvailable = availableToSell;
    }

    if (product.bundle) {
        canBeAdded = base.checkBundledProductCanBeAdded(childProducts, productLineItems, quantity); //TODO: Check -- Might have to overwrite for SM
    } else {
        totalQtyRequested = quantity + base.getQtyAlreadyInCart(productId, productLineItems);
        perpetual = product.availabilityModel.inventoryRecord.perpetual;
        canBeAdded =
            (perpetual
            || totalQtyRequested <= availableToSell);
    }

    if (!canBeAdded && stockMutualizationEnabled && !empty(SMInventoryListID)) {
        var smAvailable = 0;
        var missingQty = totalQtyRequested - availableToSell;
        var smInventory = ProductInventoryMgr.getInventoryList(SMInventoryListID);
        if (smInventory && smInventory.getRecord(product.ID)) {
            smAvailable = smInventory.getRecord(product.ID).ATS.value;
            totalAvailable += smAvailable;
        }

        if (smAvailable >= missingQty) {
            canBeAdded = true;

            // Get existing pli from SM
            smProductInCart = getSMProductInCart(product, productId, productLineItems, childProducts, options, SMInventoryListID);

            if (smProductInCart) {
                smProductInCart.setQuantityValue(missingQty);
                quantity -= missingQty;
                smProductLineItem = smProductInCart;
            } else {
                smProductLineItem = base.addLineItem(
                    currentBasket,
                    product,
                    missingQty,
                    childProducts,
                    optionModel,
                    smShipment //Split Shipments so that each PLI can have a different inventory list assigned
                );
                // Sets the Inventory List to the SM one
                Transaction.wrap(function () {
                    if (smAvailable >= smProductLineItem.quantityValue) {
                        // no-param-reassign
                        smProductLineItem.setProductInventoryList(smInventory);
                    }
                });

                quantity -= missingQty;
            }
        }
    }

    if (!canBeAdded) {
        result.error = true;
        result.message = Resource.msgf(
            'error.alert.selected.quantity.cannot.be.added.for',
            'product',
            null,
            totalAvailable,
            product.name
        );
        return result;
    }

    if (quantity > 0) {
        productInCart = base.getExistingProductLineItemInCart(
            product, productId, productLineItems, childProducts, options);
    
        if (productInCart) {
            productQuantityInCart = productInCart.quantity.value;
            quantityToSet = quantity ? quantity + productQuantityInCart : productQuantityInCart + 1;
            availableToSell = productInCart.product.availabilityModel.inventoryRecord.ATS.value;
    
            if (availableToSell >= quantityToSet || perpetual) {
                productInCart.setQuantityValue(quantityToSet);
                result.uuid = productInCart.UUID;
            } else {
                result.error = true;
                result.message = availableToSell === productQuantityInCart
                    ? Resource.msg('error.alert.max.quantity.in.cart', 'product', null)
                    : Resource.msg('error.alert.selected.quantity.cannot.be.added', 'product', null);
            }
        } else {
            var productLineItem;
            productLineItem = base.addLineItem(
                currentBasket,
                product,
                quantity,
                childProducts,
                optionModel,
                defaultShipment
            );
    
            if (hasAllocationOnSite){
                Transaction.wrap(function () {
                    // no-param-reassign
                    productLineItem.setProductInventoryList(ProductInventoryMgr.getInventoryList());
                });
            }
    
            result.uuid = productLineItem.UUID;
        }
    }

    // In case only SM Product was added
    if (empty(result.uuid)) {
        result.uuid = smProductLineItem.UUID;
    }

    return result;
}

module.exports = base;