# ComandaSmart Security Specification & Attack Matrix

## 1. Data Invariants
1. Orders must have a valid non-empty \`tableNumber\` and valid finite positive numbers for \`totalAmount\`.
2. Tables cannot be deleted during active service without administrative privilege.
3. Menu items must have positive prices and belong to a valid category.
4. Clients at tables (unauthenticated web sessions via QR Code) can create orders, read menu items/categories/restaurant_config, and create service calls.
5. Clients cannot modify staff credentials or admin configuration arbitrarily without validation.
6. Order state machine must follow valid progressions: \`received\` -> \`preparing\` -> \`ready\` -> \`delivered\` -> \`paid\`.
7. Kitchen display terminal can update order status between received, preparing, and ready.
8. Waiters can update service calls from pending to attended, update table status, and close orders.

## 2. The Dirty Dozen Payloads (Rejection Matrix)
1. **Ghost Field Injection**: Adding \`isAdmin: true\` into \`orders\` or \`service_calls\`.
2. **Negative Price Attack**: Creating or updating \`menu_items\` with \`price: -50.00\`.
3. **Invalid Table Number String Overflow**: Injecting 50KB string into \`tableNumber\`.
4. **Invalid Order Status Transition**: Attempting to set \`status: 'bypassed_payment'\`.
5. **PII Hijack in Staff**: Writing unvalidated non-staff roles into \`staff\`.
6. **Config Overwrite with Malicious Links**: Writing executable scripts in \`logoUrl\`.
7. **Service Call Status Hijack**: Creating a service call with pre-set \`status: 'attended'\` to confuse staff.
8. **Negative Total Amount in Order**: Attempting to pay \`-1000\` totalAmount.
9. **String Poisoning in Table ID**: Sending malformed characters in document IDs.
10. **Shadow Key in Category**: Injecting secret bypass flags in category documents.
11. **Order Total NaN or Infinite**: Sending numeric overflow payloads in \`totalAmount\`.
12. **Double Closing**: Modifying an already \`paid\` or \`cancelled\` order.

## 3. Test Runner Design
Any request violating field sizes, types, or authorized state updates will be rejected by Firestore Security Rules.
