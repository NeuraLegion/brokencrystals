import {
  Controller,
  Get,
  Header,
  HttpException,
  HttpStatus,
  Logger,
  Query
} from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags
} from '@nestjs/swagger';
import {
  API_DESC_QUERY_PARTNERS_RAW,
  API_DESC_PARTNERS_LOGIN,
  API_DESC_SEARCH_PARTNERS_NAMES
} from './partners.controller.swagger.desc';
import { PartnersService } from './partners.service';

@Controller('/api/partners')
@ApiTags('Partners controller')
export class PartnersController {
  private readonly logger = new Logger(PartnersController.name);

  constructor(private readonly partnersService: PartnersService) {}

  // **** This is a general XPATH injection EP - Will accept anything ****
  @Get('query')
  @ApiQuery({
    name: 'xpath',
    type: 'string',
    example: '/partners/partner/name',
    required: true
  })
  @Header('content-type', 'text/xml')
  @ApiOperation({
    description: API_DESC_QUERY_PARTNERS_RAW
  })
  @ApiOkResponse({
    type: String
  })
  async queryPartnersRaw(@Query('xpath') xpath: string): Promise<string> {
    this.logger.debug(`Getting partners with xpath expression "${xpath}"`);

    try {
      // Validate and sanitize the xpath input
      if (!this.isValidXpath(xpath)) {
        throw new Error('Invalid XPath expression');
      }
      return this.partnersService.getPartnersProperties(xpath);
    } catch (err) {
      throw new HttpException(
        `Failed to load XML using XPATH. Details: ${err}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  // **** This is a boolean based XPATH injection EP ****
  @Get('partnerLogin')
  @ApiQuery({
    name: 'username',
    type: 'string',
    example: 'walter100',
    required: true
  })
  @ApiQuery({
    name: 'password',
    type: 'string',
    example: 'Heisenberg123',
    required: true
  })
  @Header('content-type', 'text/xml')
  @ApiOperation({
    description: API_DESC_PARTNERS_LOGIN
  })
  @ApiOkResponse({
    type: String
  })
  async partnerLogin(
    @Query('username') username: string,
    @Query('password') password: string
  ): Promise<string> {
    this.logger.debug(
      `Trying to login partner with username ${username} using password ${password}`
    );

    try {
      // Validate and sanitize the username and password inputs
      if (!this.isValidInput(username) || !this.isValidInput(password)) {
        throw new Error('Invalid input');
      }
      const xpath = `//partners/partner[username/text()='${this.escapeForXPath(username)}' and password/text()='${this.escapeForXPath(password)}']/*`;
      const xmlStr = this.partnersService.getPartnersProperties(xpath);

      // Check if account's data contains any information - If not, the login failed!
      if (
        !(xmlStr && xmlStr.includes('password') && xmlStr.includes('wealth'))
      ) {
        throw new Error('Login attempt failed!');
      }

      return xmlStr;
    } catch (err) {
      const errStr = err.toString();
      const errorMessage = errStr.includes('Unterminated string literal')
        ? 'Error in XPath expression'
        : errStr;

      throw new HttpException(
        `Access denied to partner's account. ${errorMessage}`,
        HttpStatus.FORBIDDEN
      );
    }
  }

  // **** This is a string based XPATH injection EP ****
  @Get('searchPartners')
  @ApiQuery({
    name: 'keyword',
    type: 'string',
    example: 'Walter',
    required: true
  })
  @Header('content-type', 'text/xml')
  @ApiOperation({
    description: API_DESC_SEARCH_PARTNERS_NAMES
  })
  @ApiOkResponse({
    type: String
  })
  async searchPartners(@Query('keyword') keyword: string): Promise<string> {
    this.logger.debug(`Searching partner names by the keyword "${keyword}"`);

    try {
      // Validate and sanitize the keyword input
      if (!this.isValidInput(keyword)) {
        throw new Error('Invalid input');
      }
      const xpath = `//partners/partner/name[contains(., '${this.escapeForXPath(keyword)}')]`;
      return this.partnersService.getPartnersProperties(xpath);
    } catch (err) {
      const errStr = err.toString();
      const errorMessage =
        errStr.includes('XPath parse error') ||
        errStr.includes('Unterminated string literal')
          ? 'Error in XPath expression'
          : errStr;

      throw new HttpException(
        `Couldn't find partners. ${errorMessage}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  private isValidXpath(xpath: string): boolean {
    // Implement a basic validation for XPath expressions
    // This is a placeholder for a more robust validation logic
    const xpathPattern = /^\/\w+(\/\w+)*$/;
    return xpathPattern.test(xpath);
  }

  private isValidInput(input: string): boolean {
    // Implement a basic validation for general inputs
    // This is a placeholder for a more robust validation logic
    const inputPattern = /^[a-zA-Z0-9_]+$/;
    return inputPattern.test(input);
  }

  private escapeForXPath(input: string): string {
    // Escape single quotes in the input for safe XPath usage
    return input.replace(/'/g, "''");
  }
}