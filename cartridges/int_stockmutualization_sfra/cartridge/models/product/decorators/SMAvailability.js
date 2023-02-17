'use strict';

var Site = require('dw/system/Site');
var Resource = require('dw/web/Resource');

var ProductInventoryMgr = require('dw/catalog/ProductInventoryMgr');

module.exports = function (object, apiProduct, quantity, minOrderQuantity, availabilityModel) {
    var stockMutualizationEnabled = Site.current.getCustomPreferenceValue('SM_Enabled');
    var SMInventoryListID = Site.current.getCustomPreferenceValue('SM_InventoryID');
    if (stockMutualizationEnabled && !empty(SMInventoryListID)) {
        var availability = {};
        availability.messages = [];
        var productQuantity = quantity ? parseInt(quantity, 10) : minOrderQuantity;
        var SMInventoryList = ProductInventoryMgr.getInventoryList(SMInventoryListID);
        var SMAvailabilityModel = apiProduct.getAvailabilityModel(SMInventoryList);
        var availabilityModelLevels = availabilityModel.getAvailabilityLevels(productQuantity);
        var SMAvailabilityModelLevels = SMAvailabilityModel.getAvailabilityLevels(productQuantity);
        var inventoryRecord = availabilityModel.inventoryRecord;
        var SMInventoryRecord = SMAvailabilityModel.inventoryRecord;

        if (inventoryRecord && inventoryRecord.inStockDate) {
            availability.inStockDate = inventoryRecord.inStockDate.toDateString();
        } else if (SMInventoryRecord && SMInventoryRecord.inStockDate) {
            availability.inStockDate = SMInventoryRecord.inStockDate.toDateString();
        } else {
            availability.inStockDate = null;
        }

        var inStockValue = Math.min(availabilityModelLevels.inStock.value + SMAvailabilityModelLevels.inStock.value, productQuantity);
        var preOrderValue = Math.min(availabilityModelLevels.preorder.value + SMAvailabilityModelLevels.preorder.value, productQuantity);
        var backOrderValue = Math.min(availabilityModelLevels.backorder.value + SMAvailabilityModelLevels.backorder.value, productQuantity);
        var notAvailableValue = Math.max(productQuantity - (inStockValue + preOrderValue + backOrderValue), 0);

        if (inStockValue > 0) {
            if (inStockValue === productQuantity) {
                availability.messages.push(Resource.msg('label.instock', 'common', null));
            } else {
                availability.messages.push(
                    Resource.msgf(
                        'label.quantity.in.stock',
                        'common',
                        null,
                        inStockValue
                    )
                );
            }
        }

        if (preOrderValue > 0) {
            if (preOrderValue === productQuantity) {
                availability.messages.push(Resource.msg('label.preorder', 'common', null));
            } else {
                availability.messages.push(
                    Resource.msgf(
                        'label.preorder.items',
                        'common',
                        null,
                        preOrderValue
                    )
                );
            }
        }

        if (backOrderValue > 0) {
            if (backOrderValue === productQuantity) {
                availability.messages.push(Resource.msg('label.back.order', 'common', null));
            } else {
                availability.messages.push(
                    Resource.msgf(
                        'label.back.order.items',
                        'common',
                        null,
                        backOrderValue
                    )
                );
            }
        }

        if (notAvailableValue > 0) {
            if (notAvailableValue === productQuantity) {
                availability.messages.push(Resource.msg('label.not.available', 'common', null));
            } else {
                availability.messages.push(Resource.msg('label.not.available.items', 'common', null));
            }
        }

        var orderable = productQuantity - SMAvailabilityModelLevels.inStock.value >= minOrderQuantity ? availabilityModel.isOrderable(parseFloat(productQuantity - SMAvailabilityModelLevels.inStock.value)) : true;
        var SMOrderable = productQuantity - availabilityModelLevels.inStock.value >= minOrderQuantity ? SMAvailabilityModel.isOrderable(parseFloat(productQuantity - availabilityModelLevels.inStock.value)) : true;

        Object.defineProperty(object, 'availability', {
            enumerable: true,
            value: availability
        });
        Object.defineProperty(object, 'available', {
            enumerable: true,
            value: orderable && SMOrderable
        });
    }
}
