## Approach 1


1. Create an api to add items to the cart

    1. Make a list of items available to the frontend /products GET request
    2. user selects the item to the frontend and add them to the cart via /add-to-cart POST request by providing product id in post request
    3. Once the user from frontend proceed to the cart page and click on buy, Api will be called at backend /purchase POST request and discount will be applied if provided discountCode and nth order is there


    