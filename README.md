# Assignment

You are designing an ecommerce store. Clients can add items to their cart and checkout to successfully place an order. Every nth order gets a 10% discount using a code and can apply to their cart. We would like you to design and implement APIs for adding items to cart and checkout functionality. The checkout API would validate if the discount code is valid before giving the discount. 

The store also had two admin API – 1) to generate a discount code if the condition above is satisfied. 2) Admin API also lists count of items purchased, total purchase amount, list of discount codes and total discount amount. 

You can build this with a technology stack that you are comfortable with. You would push the code to your github repo and share the link once its complete. We would like to see your commits that show progression and thought process as to how you are completing the exercise. 

Things that you will be evaluated on:

1.	Functional code
2.	Code quality
3.	UI in a framework of your choice
4.	Code comments, readme docs
5.	Unit tests

Assumptions you can make:
1.	The API’s don’t need a backend store. It can be an in-memory store.


FAQ:
1. Can a discount code be used multiple times?

Discount code can be requested by every user, but is made available for every nth order only. The discount code can be used only once before the next one becomes available on the next nth order.


All the best!
