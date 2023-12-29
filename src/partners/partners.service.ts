import { Injectable, Logger } from '@nestjs/common';

var xpath = require('xpath');
const { JSDOM } = require("jsdom");

export enum PartnerProperties {
  Name = 'name',
  Age = 'age',
  Profession = 'profession',
  Residency = 'residency',
}

@Injectable()
export class PartnersService {
  private readonly log: Logger = new Logger(PartnersService.name);

  private static readonly propertiesSubCategoriesMapping = {
    "residency": ['country', 'state', 'city']
  }

  private readonly XML_AUTHORS_STR: string = `
  <?xml version="1.0" encoding="UTF-8"?>
    <partners>
      <partner>
        <name>Walter White</name>
        <age>50</age>
        <profession>Chemistry Teacher</profession>
        <residency country="US" state="New Mexico" city="Albuquerque" />
      </partner>

      <partner>
        <name>Jesse Pinkman</name>
        <age>25</age>
        <profession>Professional Cook</profession>
        <residency country="US" state="New Mexico" city="Yo Mom" />
      </partner>

      <partner>
        <name>Michael Ehrmantraut</name>
        <age>65</age>
        <profession>Security Agent</profession>
        <residency country="US" state="New Mexico" city="Albuquerque" />
      </partner>

      <partner>
        <name>Maximus Prime</name>
        <age>21</age>
        <profession>Security Analyst</profession>
        <residency country="IL" city="Haifa" />
      </partner>
    </partners>
  `;

  private getPartnersXMLObj(): object {
    const dom = new JSDOM();
    const domParser = new dom.window.DOMParser();

    let partnersXMLObj = domParser.parseFromString(this.XML_AUTHORS_STR, 'text/xml');
    return partnersXMLObj;
  }

  selectPartnerPropertyByXPATH(xpathExpression: string): Array<string> {
    let partnersXMLObj = this.getPartnersXMLObj();
    return xpath.select(xpathExpression, partnersXMLObj);
  }

  static getPropertiesSubCategoriesAsText(): string {
    let mappings = [];
    for (const [key, value] of Object.entries(PartnersService.propertiesSubCategoriesMapping)) {
      mappings.push(`${key} -> ${value}`)
    }

    return mappings.join(' | ');
  }
}
