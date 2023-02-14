'use strict';

var Site = require('dw/system/Site');

module.exports = function (object, apiProduct, quantity, minOrderQuantity, availabilityModel) {
    var stockMutualizationEnabled = Site.current.getCustomPreferenceValue('SM_Enabled');
    var SMInventoryListID = Site.current.getCustomPreferenceValue('SM_InventoryID');
    if (stockMutualizationEnabled && !empty(inventoryListID)) {
        Object.defineProperty(object, 'SMAvailability', {
            enumerable: true,
            value: (function () {
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
                } else {
                    availability.inStockDate = null;
                }

                if (availabilityModelLevels.inStock.value > 0) {
                    if (availabilityModelLevels.inStock.value === productQuantity) {
                        availability.messages.push(Resource.msg('label.instock', 'common', null));
                    } else {
                        availability.messages.push(
                            Resource.msgf(
                                'label.quantity.in.stock',
                                'common',
                                null,
                                availabilityModelLevels.inStock.value
                            )
                        );
                    }
                }

                if (availabilityModelLevels.preorder.value > 0) {
                    if (availabilityModelLevels.preorder.value === productQuantity) {
                        availability.messages.push(Resource.msg('label.preorder', 'common', null));
                    } else {
                        availability.messages.push(
                            Resource.msgf(
                                'label.preorder.items',
                                'common',
                                null,
                                availabilityModelLevels.preorder.value
                            )
                        );
                    }
                }

                if (availabilityModelLevels.backorder.value > 0) {
                    if (availabilityModelLevels.backorder.value === productQuantity) {
                        availability.messages.push(Resource.msg('label.back.order', 'common', null));
                    } else {
                        availability.messages.push(
                            Resource.msgf(
                                'label.back.order.items',
                                'common',
                                null,
                                availabilityModelLevels.backorder.value
                            )
                        );
                    }
                }

                if (availabilityModelLevels.notAvailable.value > 0) {
                    if (availabilityModelLevels.notAvailable.value === productQuantity) {
                        availability.messages.push(Resource.msg('label.not.available', 'common', null));
                    } else {
                        availability.messages.push(Resource.msg('label.not.available.items', 'common', null));
                    }
                }

                return availability;
            }())
        });
        Object.defineProperty(object, 'SMAvailable', {
            enumerable: true,
            value: availabilityModel.isOrderable(parseFloat(quantity) || minOrderQuantity)
        });
    }
}