## Approach 1


1. Create an api to add items to the cart

    1. Make a list of items available to the frontend /products GET request
    2. user selects the item to the frontend and add them to the cart via /add-to-cart POST request by providing product id in post request
    3. Once the user from frontend proceed to the cart page and click on buy, Api will be called at backend /purchase POST request
    4. Once the applied discount is hit /apply-discount?discount-code=** api is hit, At backend will check whether the order is the multiple of 10 or not If yes and discount is applied o/w not
    5. after /purchase will hit to make the purchase successful and will return the success message


    