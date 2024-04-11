import { test, expect } from '@playwright/test';
import { unified } from 'unified';
import { visit } from 'unist-util-visit'
import rehypeParse from 'rehype-parse';
import rehypeStringify from 'rehype-stringify';
import { chromium } from 'playwright';
import dotenv from 'dotenv'
import crypto from 'crypto';
import { Agent } from "undici";

import axios from 'axios';

import fs from 'fs';

const crawled = [];
let discoveredLinks = [];
let discoveredImages = [];
let all_images = []
let checked_links = []
let external_links = []
let failed_urls = []

dotenv.config({ path: '.env' })
const baseUrl = process.env.baseurl;
const startPath = process.env.subpath;
const formBaseUrl = process.env.formbaseurl;


const fetch_url = (url) => {
  return fetch(url, {
    // @ts-ignore
    dispatcher: new Agent({
      connect: {
        rejectUnauthorized: false,
        secureOptions: crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT
      }
    })
  })
}
const index_response = (title, body) => {
  return `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
  </head>
  <body>
  ${body}
  </body>
  </html>
`;

}

const send_failure_notifictaion = (url_errors) => {
  if (url_errors.length > 0) {
    const feed_back = `:large_red_circle: ${url_errors.length} broken links detected\n- ${url_errors.join('\n- ')}`;
    const params = `entry.1677587526=${feed_back}&pageHistory=0,5&partialResponse=[[[null,624417361,["General+comment+or+feedback"],0]],null,"-7930408979986934571",null,null,null,"link-checker@links.com",1]`;
    axios.post(`${formBaseUrl}?${params}`)
    .then((res) => {
        console.log(`Status: ${res.status}`);
    }).catch((err) => {
        console.error(err);
    });

  }

}

const generate_index_html = (url_errors) => {
  if (url_errors.length > 0) {
    // Create error response with status 500 and list of URLs
    const bodyResponse = `

    <h1>Error 500 - Server Error</h1>
    <p>List of URLs with errors:</p>
    <ul>
    ${url_errors.map(({ url, error }) => `<li><a href=${url}>${url}</a> - Error message: <span style="color: red">${error}</span></li>`).join('')}
      
    </ul>
`;
    
    const errorResponse = index_response("Error 500 - Server Error", bodyResponse)


    // Write the error response to index.html
    fs.writeFileSync('./dist/index.html', errorResponse);

    // Return the error status
    return { status: 500, message: 'Error 500 - Server Error. Check index.html for details.' };
  } else {
    // Create OK response with status 200
    const OkbodyResponse = `
    <h1>OK - Status 200</h1>
    <p>No errors found.</p>
`;
    const okResponse = index_response("OK - Status 200", OkbodyResponse)


    // Write the OK response to index.html
    fs.writeFileSync('./dist/index.html', okResponse);

    // Return the OK status
    return { status: 200, message: 'OK - Status 200. Check index.html for details.' };
  }
};

test('Crawl for bad URIs', async () => {
  // Launch the browser
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  

  // Function to crawl the URLs
  async function crawl(url) {

    console.log(`\n================ Crawling ${url} ================`)


    crawled.push(url);
    // Navigate to the URL
    await page.goto(url);

    
    await page.waitForTimeout(5000)
    
    const text = await page.content();

    await handleHtmlDocument(text);

    // Crawl images on the page
    await crawlImages();

    // Extract and crawl links on the page
    const links = [...new Set(discoveredLinks)];
    discoveredLinks = [];
    for (let i = 0; i < links.length; i++) {

      if (links[i].indexOf("https://") == 0 && !checked_links.includes(links[i]) ) {
        checked_links.push(links[i])
        

      await fetch_url(links[i]).then((response) => {
     
            expect(response.status, `Expected a successful HTTP response for URL ${links[i]}`).toBeLessThan(404);
            console.log(`${links[i]}: ✅`);

        })
        .catch((error) => {
            // Handle the error (e.g., log it) without rethrowing it
            console.log(`Failed ${links[i]}: ❌\nRaison: ${error.message}`);
            failed_urls.push({url:links[i], error: error.message});
          }
    )
    
    }
      
      if (!crawled.includes(links[i]) && links[i].indexOf(baseUrl + startPath) == 0) {

        await fetch_url(links[i])
        .then((response) => {
            
                expect(response.status, `Expected > 400 OK response for image ${links[i]}`).toBeLessThan(400);
                console.log(`${links[i]}: ✅`)
        })
        .catch((error) =>  {
                // Handle the error (e.g., log it) without rethrowing it
                console.log(`URL Failed ${links[i]}: ❌\nRaison: ${JSON.stringify(error)}`);
              
                failed_urls.push({url:links[i], error: error.message});
              }
    
        )


        await crawl(links[i]);

      }

    }
  }

  // Kick off the crawl
  await crawl(baseUrl + startPath);


  // Close the browser
  await browser.close();

  console.log('Crawl checked', crawled.length);
  console.log(`Failed URLS: ${JSON.stringify(failed_urls)}`)

  generate_index_html(failed_urls);
  await send_failure_notifictaion(failed_urls);
});

function handleHtmlDocument(text) {
  //console.log(text);

  return unified()
    .use(rehypeParse)
    .use(rehypeStringify)
    .use(findUris)
    .process(text)
}

async function crawlImages() {
    
  const images = [...new Set(discoveredImages)];
  discoveredImages = [];

  for (let i = 0; i < images.length; i++) {
    if (!all_images.includes(images[i])){
        fetch_url(images[i])
        .then((response) => {
            expect(response.status, `Expected less than 400 OK response for image ${images[i]}`).toBeLessThan(400);
            console.log(`${images[i]}: ✅`)

        })
        .catch((err) => {
            console.log(`IMAGE URL Failed ${images[i]}: ❌\nRaison: ${JSON.stringify(err)}`);
            
            failed_urls.push({url:images[i], error: err.message});
        })

     
    


    }
    

  }
  all_images = all_images.concat([...new Set(images)])
}

function addUri(collection, uri) {
  //console.log(uri)


  if (uri.substring(0, 1) == '/') {
    collection.push(baseUrl + uri);
    return
  }

  if (uri.indexOf(baseUrl) == 0) {
    collection.push(uri.split('#')[0]);
    return
  }
  if (uri.indexOf("https://") == 0 && !external_links.includes(uri)) {
    external_links.push(uri)
    collection.push(uri)
    return
  }

}

function isString(s) {
  return typeof s === 'string';
}

function findUris(options = {}) {
  return (tree) => {
    visit(tree, 'element', (node) => {
      
      if (node.tagName === 'a' && node.properties && isString(node.properties.href)) {
        addUri(discoveredLinks, node.properties.href);
      } else if (node.tagName === 'img' && node.properties) {

        if (isString(node.properties.src)) {
          addUri(discoveredImages, node.properties.src);
        }

        if (isString(node.properties.srcSet)) {
          (node.properties.srcSet.split(','))
            .map(s => s.split(' ')[0])
            .forEach(s => addUri(discoveredImages, s));
        }
      }
    })
  }
}