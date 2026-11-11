import type { HeadFC, PageProps } from "gatsby";
import type { Catalog } from "../../content/schema";
import { CatalogPage } from "../../ui/CatalogPage";

type Context = { catalog: Catalog };

export default function CatalogTemplate({ pageContext }: PageProps<object, Context>) {
  return <CatalogPage catalog={pageContext.catalog} />;
}

export const Head: HeadFC<object, Context> = ({ pageContext }) => {
  const { language } = pageContext.catalog;
  return (
    <>
      <html lang={language.locale} />
      <title>{language.title}</title>
      <meta name="description" content={language.description} />
    </>
  );
};
