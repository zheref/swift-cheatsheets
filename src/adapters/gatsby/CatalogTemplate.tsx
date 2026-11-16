import type { HeadFC, PageProps } from "gatsby";
import type { Catalog, SiteLanguage } from "../../content/schema";
import { CatalogPage } from "../../ui/CatalogPage";

type Context = { catalog: Catalog; languages?: SiteLanguage[] };

export default function CatalogTemplate({ pageContext }: PageProps<object, Context>) {
  return <CatalogPage catalog={pageContext.catalog} languages={pageContext.languages} />;
}

export const Head: HeadFC<object, Context> = ({ pageContext }) => {
  const { language } = pageContext.catalog;
  return (
    <>
      <title>{language.title}</title>
      <meta name="description" content={language.description} />
    </>
  );
};
