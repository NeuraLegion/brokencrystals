import { Injectable, Logger } from '@nestjs/common';

const xpath = require('xpath');
const dom = require('xmldom').DOMParser;


@Injectable()
export class PartnersService {
  private readonly logger = new Logger(PartnersService.name);

  private readonly XML_HEADER = '<?xml version="1.0" encoding="UTF-8"?>';
  private readonly XML_AUTHORS_STR: string = `
  ${this.XML_HEADER}
    <partners>
      <partner>
        <name>Walter White</name>
        <age>50</age>
        <profession>Chemistry Teacher</profession>
        <residency country="US" state="New Mexico" city="Albuquerque" />
        <username>walter100</username>
        <password>Heisenberg123</password>
        <wealth>15M USD</wealth>
      </partner>

      <partner>
        <name>Jesse Pinkman</name>
        <age>25</age>
        <profession>Professional Product Distributer</profession>
        <residency country="US" state="New Mexico" city="Yo Moma" />
        <username>dapinkman69</username>
        <password>Yoyo1!</password>
        <wealth>5M USD</wealth>
      </partner>

      <partner>
        <name>Michael Ehrmantraut</name>
        <age>65</age>
        <profession>Personal Security Agent</profession>
        <residency country="US" state="New Mexico" city="Albuquerque" />
        <username>_safetyman_</username>
        <password>LittleKid777</password>
        <wealth>50M USD</wealth>
      </partner>

      <partner>
        <name>Gus Fring</name>
        <age>52</age>
        <profession>Restaurant Chain Owner</profession>
        <residency country="US" state="New Mexico" city="Albuquerque" />
        <username>ChickMan</username>
        <password>GoodChicken4U</password>
        <wealth>Too much USD</wealth>
      </partner>
    </partners>
  `;

  private getPartnersXMLObj(): object {
    let partnersXMLObj = new dom().parseFromString(this.XML_AUTHORS_STR, 'text/xml');
    return partnersXMLObj;
  }

  private selectPartnerPropertiesByXPATH(xpathExpression: string): Array<string> {
    let partnersXMLObj = this.getPartnersXMLObj();
    return xpath.select(xpathExpression, partnersXMLObj);
  }

  private getFormattedXMLOutput(xmlNodes): string {
    return `${this.XML_HEADER}\n<root>\n${xmlNodes.join('\n')}\n</root>`;
  }

  getPartnersProperties(xpathExpression: string): string {
    let xmlNodes = this.selectPartnerPropertiesByXPATH(xpathExpression);

    if (!Array.isArray(xmlNodes)) {
      this.logger.debug(`xmlNodes's type wasn't 'Array', and it's value was: ${xmlNodes}`)
      xmlNodes = Array();
    } else {
      this.logger.debug(`Raw xpath xmlNodes value is: ${xmlNodes}`);
    }

    return this.getFormattedXMLOutput(xmlNodes);
  }
}
