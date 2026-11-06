# add-login — add login

## Why

Users cannot sign in.

## Requirements

### Requirement: Login form

The system SHALL show a login form.

#### Scenario: Form renders

- GIVEN a signed-out user
- WHEN they open /login
- THEN a form with email and password is shown

#### Scenario: Bad password

- GIVEN a signed-out user
- WHEN they submit a wrong password
- THEN an error is shown

### Requirement: Session

The system SHALL start a session after a good password.

#### Scenario: Good password

- GIVEN a signed-out user
- WHEN they submit the right password
- THEN they are signed in
