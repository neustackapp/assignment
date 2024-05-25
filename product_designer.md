For your take home assignment, we would like you to design a Rules Engine Editor. Here is an example rules engine - npmjs.com/package/json-rules-engine

Below are rules that an underwriter at an insurance company needs to configure in a rules engine:

1. Ask applicant if they are Employee or Spouse
    1. If they are Employee, show them products Alpha, Beta, Gamma
    2. if they are Spouse, show them the product Delta, Epsilon
2. Ask them for their Date of Birth
    1. If the applicant is Employee and their age is greater than 80, decline the application
    2. If the applicant is Spouse and their age is greater than 70, decline the application
3. Ask them for their Height and Weight. If BMI > 20, decline the application, else approve the application.
4. Collect the applicant address. For the general applicant states, possible values for Gender question is Male, Female. If the applicant address state is in (NJ, FL, WA, KS, NY), then the options are Male, Female, Nonbinary.

Your goal is to design a Rules Engine Editor/Visualizer for the underwriter to design the rules above.
