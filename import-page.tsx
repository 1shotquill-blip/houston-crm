// apps/web/app/crm/import/page.tsx
'use client'

import { useState } from 'react'
import { DashboardShell } from '@/components/dashboard/shell'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { trpc } from '@/lib/trpc'
import { Upload, CheckCircle2, AlertCircle, Download } from 'lucide-react'
import { useRouter } from 'next/navigation'
import Papa from 'papaparse'

interface ParsedContact {
  firstName: string
  lastName: string
  email?: string
  phone?: string
  company?: string
  jobTitle?: string
  leadSource?: string
}

export default function ImportPage() {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [parsedData, setParsedData] = useState<ParsedContact[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const [step, setStep] = useState<'upload' | 'preview' | 'importing' | 'complete'>('upload')

  const importMutation = trpc.contact.bulkImport.useMutation({
    onSuccess: (result) => {
      setStep('complete')
    }
  })

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (!selectedFile) return

    if (!selectedFile.name.endsWith('.csv')) {
      setErrors(['Please upload a CSV file'])
      return
    }

    setFile(selectedFile)
    setErrors([])

    // Parse CSV
    Papa.parse(selectedFile, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const contacts: ParsedContact[] = []
        const parseErrors: string[] = []

        results.data.forEach((row: any, index) => {
          // Map CSV columns to contact fields
          const contact: ParsedContact = {
            firstName: row['First Name'] || row['first_name'] || row['firstName'] || '',
            lastName: row['Last Name'] || row['last_name'] || row['lastName'] || '',
            email: row['Email'] || row['email'] || undefined,
            phone: row['Phone'] || row['phone'] || undefined,
            company: row['Company'] || row['company'] || undefined,
            jobTitle: row['Job Title'] || row['job_title'] || row['jobTitle'] || undefined,
            leadSource: row['Lead Source'] || row['lead_source'] || row['source'] || undefined
          }

          // Validate required fields
          if (!contact.firstName || !contact.lastName) {
            parseErrors.push(`Row ${index + 1}: Missing first name or last name`)
          } else {
            contacts.push(contact)
          }
        })

        if (parseErrors.length > 0) {
          setErrors(parseErrors)
        }

        setParsedData(contacts)
        if (contacts.length > 0) {
          setStep('preview')
        }
      },
      error: (error) => {
        setErrors([`Failed to parse CSV: ${error.message}`])
      }
    })
  }

  const handleImport = async () => {
    setStep('importing')
    await importMutation.mutateAsync({
      contacts: parsedData,
      skipDuplicates: true
    })
  }

  const downloadTemplate = () => {
    const csv = 'First Name,Last Name,Email,Phone,Company,Job Title,Lead Source\nJohn,Doe,john@example.com,+1234567890,Acme Inc,CEO,Website\nJane,Smith,jane@example.com,+0987654321,Example Corp,CTO,Referral'
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'contact-import-template.csv'
    a.click()
  }

  return (
    <DashboardShell>
      <div className="space-y-6 max-w-4xl">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Import Contacts</h1>
          <p className="text-muted-foreground">
            Upload a CSV file to bulk import contacts
          </p>
        </div>

        {/* Upload Step */}
        {step === 'upload' && (
          <Card>
            <CardHeader>
              <CardTitle>Upload CSV File</CardTitle>
              <CardDescription>
                Select a CSV file containing your contacts. Not sure about the format?{' '}
                <button
                  onClick={downloadTemplate}
                  className="text-primary hover:underline inline-flex items-center"
                >
                  <Download className="h-3 w-3 mr-1" />
                  Download template
                </button>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="csv-file">CSV File</Label>
                <Input
                  id="csv-file"
                  type="file"
                  accept=".csv"
                  onChange={handleFileChange}
                />
              </div>

              {errors.length > 0 && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Errors found</AlertTitle>
                  <AlertDescription>
                    <ul className="list-disc pl-4 space-y-1">
                      {errors.map((error, i) => (
                        <li key={i}>{error}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}

              <div className="rounded-lg border border-dashed p-6 text-center">
                <Upload className="mx-auto h-12 w-12 text-muted-foreground" />
                <p className="mt-2 text-sm text-muted-foreground">
                  {file ? file.name : 'No file selected'}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Preview Step */}
        {step === 'preview' && (
          <Card>
            <CardHeader>
              <CardTitle>Preview Import</CardTitle>
              <CardDescription>
                Review the contacts before importing. Found {parsedData.length} contacts.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="max-h-96 overflow-y-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Company</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsedData.slice(0, 50).map((contact, i) => (
                      <TableRow key={i}>
                        <TableCell>{contact.firstName} {contact.lastName}</TableCell>
                        <TableCell>{contact.email || '-'}</TableCell>
                        <TableCell>{contact.phone || '-'}</TableCell>
                        <TableCell>{contact.company || '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {parsedData.length > 50 && (
                <p className="text-sm text-muted-foreground">
                  Showing first 50 of {parsedData.length} contacts
                </p>
              )}

              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => {
                  setStep('upload')
                  setFile(null)
                  setParsedData([])
                }}>
                  Cancel
                </Button>
                <Button onClick={handleImport}>
                  Import {parsedData.length} Contacts
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Importing Step */}
        {step === 'importing' && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent mb-4" />
              <p className="text-lg font-medium">Importing contacts...</p>
              <p className="text-sm text-muted-foreground">This may take a moment</p>
            </CardContent>
          </Card>
        )}

        {/* Complete Step */}
        {step === 'complete' && importMutation.data && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 space-y-4">
              <CheckCircle2 className="h-16 w-16 text-green-500" />
              <div className="text-center">
                <h2 className="text-2xl font-bold">Import Complete!</h2>
                <p className="text-muted-foreground mt-2">
                  Successfully imported {importMutation.data.created} contacts
                  {importMutation.data.skipped > 0 && ` (skipped ${importMutation.data.skipped} duplicates)`}
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => {
                  setStep('upload')
                  setFile(null)
                  setParsedData([])
                }}>
                  Import More
                </Button>
                <Button onClick={() => router.push('/crm')}>
                  View Contacts
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardShell>
  )
}
