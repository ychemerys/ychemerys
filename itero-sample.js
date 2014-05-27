'use strict';

/// The modal for the 3D-Secure popup needs a simple controller to pass along some data.
var ModalInstanceCtrl = function ($scope, $modalInstance, url, params, onclose) {
    $scope.url = url;
    $scope.params = params;
    $scope.cancel = function () {
        $modalInstance.dismiss('cancel');
        onclose();
    };
};

var SignupController = function ($scope, $http, $modal) {
    var self = this;
    $scope.order = null;
    // Some default data so we don't have to enter a ton of info every time
    $scope.customerData = { firstName: "Marcellus", lastName: "Wallace", emailAddress: "mw@example.com", Tag: "customer_id_123" };
    $scope.paymentData = { bearer: "CreditCard:Paymill", "cardNumber": "4111111111111111", cardHolder: "Marcellus Wallace", cvc: "911", expiryMonth: "12", expiryYear: "2017" };
    $scope.paymentMethods = {};
    $scope.paymentMethodEnum = [];
    $scope.paymentReady = false;

    // A lookup table for 'friendly' payment provider names
    // FIXME: This isn't pretty, and having the PSP's name in the strings for direct debit and credit card seems nonsensical
    $scope.paymentMethodNames = { "CreditCard:Paymill": "Credit Card", "Debit:Paymill": "Direct Debit", "Skrill": "Skrill", "PayPal": "PayPal" };

    // The signup method that is called when the user submits the form
    $scope.signUp = function () {
        // To indicate that the site is working and to disable the signup button, we're setting a flag
        $scope.signupRunning = true;
        // pass the order, customerData and payment data to IteroJS
        // DTO: PaymentData
        self.iteroInstance.subscribe(self.iteroJSPayment, $scope.order, $scope.customerData, $scope.paymentData, function (data) {
            // This callback will be invoked when the signup succeeded (or failed)
            // Note that the callback must use $apply, otherwise angularjs won't notice we changed something:
            $scope.$apply(function () {
                $scope.signupRunning = false;
                if (!data.Url)
                    $scope.isSuccess = true; //done
                else
                    window.location = data.Url; // redirect required, e.g. paypal, skrill
            });
        }, function (error) { alert("an error occurred during signup!"); console.log(error); });
    };

    $scope.preview = function () {
        // ask IteroJS to update the expected total. preview() will internally use a timeout so it doesn't
        // send a ton of requests and we don't need to bother with timeouts here.
        self.iteroInstance.preview($scope.order, $scope.customerData, function (data) {
            // use $scope.$apply so angular knows we're messing around with the scope's state again
            $scope.$apply(function () {
                // DTO: PreviewResponse
                // DTO: OrderPost, CustomerDataPost
                $scope.order = data.Order;
            });
        }, function () {});
    };

    var modalInstance = null;

    // TODO: Maybe use a different DTO
    var tdsInit = function tdsInit(redirect, cancelCallback) {
        var url = redirect.url;
        var params = redirect.params;

        // Open the modal to show the bank's 3d-secure iframe
        modalInstance = $modal.open({
            templateUrl: '3ds-modal.html',
            controller: ModalInstanceCtrl,
            windowClass: "fade in",
            resolve: {
                url: function () {
                    return redirect.url;
                },
                params: function () {
                    return redirect.params;
                },
                onclose: function () {
                    return function () {
                        // Tell itero we're no longer trying to sign up:
                        self.iteroInstance.abort();
                    };
                }
            }
        });

        modalInstance.result.then(function (result) {
        }, function () {
            // if the modal was dimissed, we can enable the signup button again
            $scope.signupRunning = false;
        });
    };

    var tdsCleanup = function () {
        // tdsCleanup will be called if paymill wants us to close the modal, i.e. the process was successful
        // TODO: It's not clear from the documentation if that's always true, 3DS frame contents depend on the
        // issuer bank.
        modalInstance.close('external cleanup');
    };

    var paymentConfig = {
        // REQUIRED. The initial order to be displayed. This will be requested immediately upon load
        publicApiKey: "537229dd1d8dd00ec89960ac",

        // REQUIRED. After payment user will be redirected to this URL.
        providerReturnUrl : "http://www.pactas.com",

        // OPTIONAL. Overwrite the handling of the 3d-secure iframes. Comment out these 
        // two lines to see what happens without (essentially the same, but not customizable).
        // Only applies to paymill. You might want to read paymill's documentation on the subject.
        "popupCreate": tdsInit,
        "popupClose": tdsCleanup
    };

    self.iteroJSPayment = new IteroJS.Payment(paymentConfig, function () {
        $scope.$apply(function () {
            // When IteroJS is ready, copy the payment methods and initial order
            $scope.paymentReady = true;
            $scope.paymentMethods = self.iteroJSPayment.getAvailablePaymentMethods();
            $scope.paymentMethodEnum = self.iteroJSPayment.getAvailablePaymentMethodEnum();
            $scope.paymentData.bearer = $scope.paymentMethodEnum[0];
        });
    }, function (errorData) {
        alert("error initializing payment!");
        console.log(errorData);
    });

    var initialCart = { planVariantId: "537dbf9a1d8dd00234ad33d2",
                        componentSubscriptions: [{ componentId: "537dc1911d8dd00234ad33f7", quantity: 1}] };
    self.iteroInstance = new IteroJS.Signup();
    self.iteroInstance.preview(initialCart, $scope.customerData, function (success) {
        $scope.$apply(function () {
            $scope.order = success.Order;
        });
    }, function (error) {
        alert("an error occured!"); console.log(error);
    });
};

// This directive encapsulates the DOM modifications required to intialize the 3DS
// iframe. The core of this code is from paymill's own js bridge, but the directive
// bindings are a little intricate
angular.module('iteroAngular.directives', []).directive("3dsModal", function ($parse) {
    return {
        restrict: "A",
        scope: {
            params: "@",
            url: "@"
        },
        link: function (scope, element, attrs) {
            var url = scope.url;
            var params = JSON.parse(scope.params);
            var iframe = element[0];
            var iframeDoc = iframe.contentWindow || iframe.contentDocument;
            if (iframeDoc.document) iframeDoc = iframeDoc.document;
            var form = iframeDoc.createElement('form');
            form.method = 'post';
            form.action = url;
            for (var k in params) {
                var input = iframeDoc.createElement('input');
                input.type = 'hidden';
                input.name = k;
                input.value = decodeURIComponent(params[k]);
                form.appendChild(input);
            }
            if (iframeDoc.body) iframeDoc.body.appendChild(form);
            else iframeDoc.appendChild(form);
            form.submit();
        }
    };
});

// angularjs dependency injection
angular.module('iteroAngular', ['iteroAngular.directives', 'ui.bootstrap.modal']);
