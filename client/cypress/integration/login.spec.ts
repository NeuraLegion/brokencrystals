describe('Log In', () => {
  beforeEach(() => cy.visit('/login'));

  it('should successfully logs in', () => {
    // we can submit form using "cy.submit" command
    // https://on.cypress.io/submit
    cy.get('input[name=user]').type('admin');
    cy.get('input[name=password]').type('admin');
    cy.get('button[type=submit]').click();

    // we should be in
    cy.url().should('include', '/');
    cy.get('a.get-started-btn').should('contain', 'Log out admin');
  });

  it('should displays errors on login', function () {
    // alias this request so we can wait on it later
    cy.intercept('POST', '/login').as('postLogin');

    // incorrect username on password
    cy.get('input[name=user]').type('jane.lae');
    cy.get('input[name=password]').type('password123{enter}');

    // we should always explicitly check if the status equals 401
    cy.wait('@postLogin').its('response.statusCode').should('eq', 401);

    // and still be on the same URL
    cy.url().should('include', '/login');
  });

  it('can stub the XHR to force it to fail', function () {
    // alias this request so we can wait on it later
    cy.intercept('POST', '/login', { statusCode: 503, delay: 5000 }).as(
      'postLogin'
    );

    // incorrect username on password
    cy.get('input[name=user]').type('admin');
    cy.get('input[name=password]').type('admin{enter}');

    // we should always explicitly check if the status equals 401
    cy.wait('@postLogin').its('response.statusCode').should('eq', 503);

    // and still be on the same URL
    cy.url().should('include', '/login');
  });
});
